import FormidableFormRenderer from './form-renderer-engine.js';

const renderer = new FormidableFormRenderer({
  formKey: 'contact-form',
  mountSelector: '#form-mount',
  hydrated: payload
});
renderer.render();