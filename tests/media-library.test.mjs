import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    archiveMediaAsset,
    assignMediaAsAppCover,
} from '../lib/media-library.js';
import { createMediaUploadAuthorization } from '../lib/media-storage.js';

test('media upload rejects unsupported image types before storage authorization', async () => {
    await assert.rejects(
        () =>
            createMediaUploadAuthorization({
                appSlug: 'demo',
                filename: 'logo.gif',
                byteSize: 100,
                contentType: 'image/gif',
            }),
        /JPG, PNG, or WebP/,
    );
});

test('media upload rejects oversized images before storage authorization', async () => {
    await assert.rejects(
        () =>
            createMediaUploadAuthorization({
                appSlug: 'demo',
                filename: 'cover.png',
                byteSize: 13 * 1024 * 1024,
                contentType: 'image/png',
            }),
        /12 MB/,
    );
});

test('assigning ready media as app cover updates app and media assignment', async () => {
    const calls = [];
    const client = {
        async query(sql, params = []) {
            calls.push({ sql, params });
            if (sql.includes("FROM media_assets WHERE id=$1 AND state='ready'")) {
                return {
                    rows: [
                        {
                            id: 'media-1',
                            public_url: 'https://media.example/cover.webp',
                            app_id: null,
                        },
                    ],
                    rowCount: 1,
                };
            }
            if (sql.includes('SELECT id,slug,name,status FROM apps WHERE id=$1')) {
                return {
                    rows: [{ id: 'app-1', slug: 'demo', name: 'Demo', status: 'Live' }],
                    rowCount: 1,
                };
            }
            return { rows: [], rowCount: 1 };
        },
    };

    const result = await assignMediaAsAppCover(client, 'admin-1', {
        media_id: 'media-1',
        app_id: 'app-1',
    });

    assert.equal(result.ok, true);
    assert.equal(result.cover_image_url, 'https://media.example/cover.webp');
    assert.ok(
        calls.some(
            (call) =>
                call.sql.includes('UPDATE apps SET cover_image_url=$1') &&
                call.params[0] === 'https://media.example/cover.webp',
        ),
    );
    assert.ok(
        calls.some(
            (call) =>
                call.sql.includes('UPDATE media_assets SET app_id=$1') &&
                call.params[0] === 'app-1',
        ),
    );
});

test('media currently used as an app cover cannot be archived', async () => {
    const client = {
        async query(sql) {
            if (sql.includes('SELECT id,app_id,public_url,state FROM media_assets')) {
                return {
                    rows: [
                        {
                            id: 'media-1',
                            app_id: 'app-1',
                            public_url: 'https://media.example/cover.webp',
                            state: 'ready',
                        },
                    ],
                    rowCount: 1,
                };
            }
            if (sql.includes('SELECT id FROM apps WHERE cover_image_url=$1')) {
                return { rows: [{ id: 'app-1' }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
        },
    };

    await assert.rejects(
        () => archiveMediaAsset(client, 'admin-1', 'media-1'),
        /currently assigned as an app cover/,
    );
});
