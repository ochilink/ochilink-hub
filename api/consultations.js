import hub from './hub.js';
export default function handler(req, res) {
    req.query = { ...req.query, resource: 'consultations' };
    return hub(req, res);
}
