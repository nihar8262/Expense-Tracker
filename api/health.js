module.exports = async function handler(_request, response) {
  return response.status(200).json({ ok: true });
};