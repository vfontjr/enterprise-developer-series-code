new FormidableSubmitHandler(formEl, {
  formKey,
  endpoint: `/wp-json/frm/v2/forms/${formData.id}/entries`,
  validate: simpleRequiredValidator,
  honeypotSelector: 'input[type="text"][data-honeypot]'
}).attach();