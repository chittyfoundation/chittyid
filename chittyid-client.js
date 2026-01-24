// ChittyID Service Client
const CHITTYID_SERVICE = 'https://foundation.thechitty.com';

async function mintChittyID(domain, subtype, metadata = {}) {
  const response = await fetch(`${CHITTYID_SERVICE}/v1/mint`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${process.env.CHITTY_ID_TOKEN}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ domain, subtype, metadata })
  });

  const { chitty_id } = await response.json();
  return chitty_id;
}

module.exports = { mintChittyID };
