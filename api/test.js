module.exports = function handler(req, res) {
  res.status(200).json({ 
    ok: true, 
    message: 'API funcionando!',
    timestamp: new Date().toISOString()
  });
};
