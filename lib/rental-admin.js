import { createPrivateDownloadUrl } from './blob-storage.js';

function fail(status, message) {
    throw Object.assign(new Error(message), { status });
}
const allowedStatuses = new Set([
    'submitted',
    'under_review',
    'additional_information_required',
    'approved',
    'denied',
    'withdrawn',
    'archived',
]);

export async function listRentalApplications(pool, q = '', status = 'all') {
    const where = [];
    const params = [];
    if (status && status !== 'all') {
        if (!allowedStatuses.has(status) && status !== 'pending_payment' && status !== 'payment_expired')
            fail(400, 'Invalid application status.');
        params.push(status);
        where.push(`r.status=$${params.length}`);
    }
    if (q) {
        params.push('%' + String(q).trim().toLowerCase().slice(0, 120) + '%');
        where.push(`(
            lower(r.applicant_name) LIKE $${params.length}
            OR lower(r.applicant_email) LIKE $${params.length}
            OR lower(r.property_address) LIKE $${params.length}
            OR lower(r.id::text) LIKE $${params.length}
        )`);
    }
    const result = await pool.query(
        `SELECT r.id,r.applicant_name,r.applicant_email,r.applicant_phone,r.property_address,
                r.status,r.payment_status,r.total_cents,r.currency,r.paid_at,r.submitted_at,
                r.created_at,r.updated_at,r.customer_id,c.name AS customer_name,c.email AS customer_email,
                count(d.id) FILTER (WHERE d.state='ready' AND d.trashed_at IS NULL)::int AS document_count
         FROM rental_applications r
         LEFT JOIN customer_accounts c ON c.id=r.customer_id
         LEFT JOIN customer_documents d ON d.application_id=r.id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         GROUP BY r.id,c.id
         ORDER BY r.created_at DESC
         LIMIT 300`,
        params,
    );
    return { applications: result.rows };
}

export async function rentalApplicationAdminDetail(pool, id) {
    const app = (await pool.query(
        `SELECT r.id,r.applicant_name,r.applicant_email,r.applicant_phone,r.property_address,
                r.status,r.payment_status,r.application_fee_cents,r.processing_fee_cents,
                r.total_cents,r.currency,r.stripe_session_id,r.stripe_payment_intent,
                r.paid_at,r.submitted_at,r.created_at,r.updated_at,r.customer_id,
                c.name AS customer_name,c.email AS customer_email
         FROM rental_applications r
         LEFT JOIN customer_accounts c ON c.id=r.customer_id
         WHERE r.id=$1`,
        [id],
    )).rows[0];
    if (!app) fail(404, 'Rental application not found.');
    const documents = (await pool.query(
        `SELECT d.id,d.original_name,d.content_type,d.byte_size,d.state,d.starred,d.shared,
                d.uploaded_at,d.trashed_at,d.created_at,f.name AS folder_name
         FROM customer_documents d
         LEFT JOIN customer_folders f ON f.id=d.folder_id
         WHERE d.application_id=$1
         ORDER BY COALESCE(d.uploaded_at,d.created_at) DESC`,
        [id],
    )).rows;
    return { application: app, documents };
}

export async function updateRentalApplicationStatus(client, actorId, id, status) {
    if (!allowedStatuses.has(status)) fail(400, 'Invalid application status.');
    const current = (await client.query(
        'SELECT id,status,payment_status,customer_id FROM rental_applications WHERE id=$1 FOR UPDATE',
        [id],
    )).rows[0];
    if (!current) fail(404, 'Rental application not found.');
    if (current.payment_status !== 'paid' && !['withdrawn','archived'].includes(status))
        fail(409, 'Payment must be verified before review status can be changed.');
    const updated = (await client.query(
        `UPDATE rental_applications SET status=$1,updated_at=now() WHERE id=$2
         RETURNING id,status,updated_at`,
        [status,id],
    )).rows[0];
    await client.query(
        `INSERT INTO security_auth_logs(actor_id,event_type,metadata)
         VALUES ($1,'RENTAL_APPLICATION_STATUS_CHANGED',$2)`,
        [actorId,{ application_id:id, from:current.status, to:status }],
    );
    return updated;
}

export async function adminRentalDocumentDownload(pool, applicationId, documentId) {
    const row = (await pool.query(
        `SELECT d.id,d.pathname,d.original_name,d.content_type
         FROM customer_documents d
         JOIN rental_applications r ON r.id=d.application_id
         WHERE r.id=$1 AND d.id=$2 AND d.state='ready' AND d.trashed_at IS NULL`,
        [applicationId,documentId],
    )).rows[0];
    if (!row) fail(404, 'Document not found.');
    const signed = await createPrivateDownloadUrl(row.pathname);
    return { ...signed, name: row.original_name, content_type: row.content_type };
}


export async function rentalFeeAdminSnapshot(pool) {
    const [config, history] = await Promise.all([
        pool.query('SELECT application_fee_cents,processing_percent,processing_fixed_cents,updated_by,updated_at FROM rental_fee_config WHERE id=1'),
        pool.query(`SELECT id,changed_by,old_config,new_config,created_at
                    FROM rental_fee_history ORDER BY created_at DESC LIMIT 50`),
    ]);
    if (!config.rows[0]) fail(503, 'Rental fee configuration is unavailable.');
    return { config: config.rows[0], history: history.rows };
}

export async function updateRentalFees(client, actorId, body) {
    const applicationFee = Number(body.application_fee_cents);
    const percent = Number(body.processing_percent);
    const fixed = Number(body.processing_fixed_cents);
    if (!Number.isInteger(applicationFee) || applicationFee < 0 || applicationFee > 10000000)
        fail(400, 'Invalid application fee.');
    if (!Number.isFinite(percent) || percent < 0 || percent > 100)
        fail(400, 'Invalid processing percentage.');
    if (!Number.isInteger(fixed) || fixed < 0 || fixed > 1000000)
        fail(400, 'Invalid fixed processing fee.');
    const old = (await client.query(
        'SELECT application_fee_cents,processing_percent,processing_fixed_cents FROM rental_fee_config WHERE id=1 FOR UPDATE',
    )).rows[0];
    if (!old) fail(503, 'Rental fee configuration is unavailable.');
    const updated = (await client.query(
        `UPDATE rental_fee_config
         SET application_fee_cents=$1,processing_percent=$2,processing_fixed_cents=$3,
             updated_by=$4,updated_at=now()
         WHERE id=1
         RETURNING application_fee_cents,processing_percent,processing_fixed_cents,updated_by,updated_at`,
        [applicationFee,percent,fixed,actorId],
    )).rows[0];
    await client.query(
        `INSERT INTO rental_fee_history(changed_by,old_config,new_config)
         VALUES ($1,$2,$3)`,
        [actorId,old,updated],
    );
    await client.query(
        `INSERT INTO security_auth_logs(actor_id,event_type,metadata)
         VALUES ($1,'RENTAL_FEES_UPDATED',$2)`,
        [actorId,{ old_config:old, new_config:updated }],
    );
    return updated;
}
