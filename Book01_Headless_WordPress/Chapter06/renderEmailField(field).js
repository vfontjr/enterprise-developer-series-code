renderEmailField(field) {
  const wrapper = document.createElement('div');
  wrapper.classList.add('form-field', 'form-field--email');

  const label = document.createElement('label');
  label.htmlFor = field.key;
  label.textContent = field.label;
  if (field.required) {
    label.innerHTML += ' <span aria-hidden="true">*</span>';
  }

  const input = document.createElement('input');
  input.type = 'email';
  input.name = `item_meta[${field.id}]`;
  input.id = field.key;
  input.required = !!field.required;

  wrapper.append(label, input);
  return wrapper;
}