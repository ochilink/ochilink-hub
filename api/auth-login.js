import handler from './hub.js';
export default function login(req, res) {
    req.query = { ...req.query, resource: 'login' };
    return handler(req, res);
}
