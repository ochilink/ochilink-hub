import hub from './hub.js';
export default function handler(req, res) {
    req.query = { ...req.query, resource: req.method === 'GET' ? 'availability' : 'availability-admin' };
    return hub(req, res);
}
