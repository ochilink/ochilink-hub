export default function handler(req, res) {
    res.status(410).json({ error: 'This endpoint is not enabled for Ochilink Hub.' });
}
