fetch(endpoint, {
  method: 'POST',
  headers: { 'X-WP-Nonce': wpApiSettings?.nonce || '' },
  body: new FormData(formEl),
  credentials: 'same-origin'
})