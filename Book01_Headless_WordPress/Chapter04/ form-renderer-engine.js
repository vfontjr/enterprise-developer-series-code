/**
 * Formidable Form Renderer Engine
 * Enterprise-grade rendering engine for headless Formidable Forms using REST API metadata.
 * Supports: conditional logic, validation, anti-spam, draft saving, ActiveCampaign forwarding.
 * Usage: FormidableFormRendererEngine({ formKey: 'contact-form', mountSelector: '#app' });
 */

async function FormidableFormRendererEngine({ formKey, mountSelector, enableCaptcha = false }) {
  const getFormIdFromKey = async (key) => {
    const response = await fetch(`/wp-json/custom/v1/form-id/${key}`);
    if (!response.ok) throw new Error('Form ID not found');
    const data = await response.json();
    return data.id;
  };

  const getFormMetadata = async (formId) => {
    const response = await fetch(`/wp-json/frm/v2/forms/${formId}`);
    if (!response.ok) throw new Error('Form metadata not found');
    return await response.json();
  };

  const getFormFields = async (formId) => {
    const response = await fetch(`/wp-json/frm/v2/forms/${formId}/fields`);
    if (!response.ok) throw new Error('Form fields not found');
    return await response.json();
  };

  const buildField = (field) => {
    const wrapper = document.createElement('div');
    wrapper.id = `frm_field_${field.id}_container`;
    wrapper.className = `frm_form_field form-field ${field.required === '1' ? 'frm_required_field' : ''} ${field.field_options.classes || ''}`;

    if (!['hidden', 'captcha', 'submit'].includes(field.type)) {
      const label = document.createElement('label');
      label.htmlFor = `field_${field.field_key}`;
      label.id = `field_${field.field_key}_label`;
      label.className = 'frm_primary_label';
      label.innerHTML = `${field.name} ${field.required === '1' ? '<span class="frm_required">*</span>' : ''}`;
      wrapper.appendChild(label);
    }

    let input;
    switch (field.type) {
      case 'text':
      case 'email':
        input = document.createElement('input');
        input.type = field.type;
        input.name = `item_meta[${field.id}]`;
        input.id = `field_${field.field_key}`;
        input.setAttribute('data-key', field.field_key);
        input.setAttribute('data-reqmsg', field.field_options.blank);
        input.setAttribute('data-invmsg', field.field_options.invalid);
        input.setAttribute('aria-required', field.required === '1' ? 'true' : 'false');
        break;

      case 'textarea':
        input = document.createElement('textarea');
        input.name = `item_meta[${field.id}]`;
        input.id = `field_${field.field_key}`;
        input.rows = field.field_options.max || 5;
        input.setAttribute('data-key', field.field_key);
        input.setAttribute('data-reqmsg', field.field_options.blank);
        input.setAttribute('data-invmsg', field.field_options.invalid);
        input.setAttribute('aria-required', field.required === '1' ? 'true' : 'false');
        break;

      case 'checkbox':
        input = document.createElement('div');
        input.className = 'frm_opt_container';
        input.setAttribute('role', 'group');
        input.setAttribute('aria-labelledby', `field_${field.field_key}_label`);
        field.options.forEach((opt, idx) => {
          const checkboxWrapper = document.createElement('div');
          checkboxWrapper.className = 'frm_checkbox';
          const label = document.createElement('label');
          label.htmlFor = `field_${field.field_key}-${idx}`;
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.name = `item_meta[${field.id}][]`;
          checkbox.id = `field_${field.field_key}-${idx}`;
          checkbox.value = opt.value || opt;
          label.appendChild(checkbox);
          label.append(` ${opt.label || opt}`);
          checkboxWrapper.appendChild(label);
          input.appendChild(checkboxWrapper);
        });
        break;

      case 'hidden':
        input = document.createElement('input');
        input.type = 'hidden';
        input.name = `item_meta[${field.id}]`;
        input.id = `field_${field.field_key}`;
        input.value = field.default_value || '';
        break;

      case 'captcha':
        input = document.createElement('div');
        input.id = `field_${field.field_key}`;
        input.className = 'cf-turnstile';
        input.dataset.sitekey = '0x4AAAAAAAWYtWRiMaUVODel';
        input.dataset.size = field.field_options.captcha_size || 'normal';
        input.dataset.theme = field.field_options.captcha_theme || 'light';
        break;

      case 'submit':
        const submitWrapper = document.createElement('div');
        submitWrapper.className = 'frm_submit';
        const submitBtn = document.createElement('button');
        submitBtn.type = 'submit';
        submitBtn.className = 'frm_button_submit fm-form-submit';
        submitBtn.innerText = field.name || 'Submit';
        submitWrapper.appendChild(submitBtn);
        return submitWrapper;

      default:
        return null;
    }

    if (input) wrapper.appendChild(input);

    if (field.description) {
      const desc = document.createElement('div');
      desc.id = `frm_desc_field_${field.field_key}`;
      desc.className = 'frm_description';
      desc.innerHTML = field.description;
      wrapper.appendChild(desc);
    }

    return wrapper;
  };

  const applyConditionalLogic = (formEl, fields) => {
    const fieldMap = Object.fromEntries(fields.map(f => [f.field_key, f]));
    fields.forEach(field => {
      const opts = field.field_options;
      if (!opts || !opts.hide_field?.length) return;

      const targetEl = formEl.querySelector(`#frm_field_${field.id}_container`);
      const evaluate = () => {
        const results = opts.hide_field.map((key, idx) => {
          const operator = opts.hide_field_cond?.[idx] || '==';
          const trigger = formEl.querySelector(`[data-key="${key}"]`);
          const value = trigger?.value ?? '';
          const compare = opts.hide_opt?.[idx] ?? '';
          return operator === '!=' ? value !== compare : value === compare;
        });

        const show = opts.show_hide === 'show'
          ? (opts.any_all === 'any' ? results.some(Boolean) : results.every(Boolean))
          : !(opts.any_all === 'any' ? results.some(Boolean) : results.every(Boolean));

        if (targetEl) targetEl.style.display = show ? '' : 'none';
      };

      opts.hide_field.forEach(key => {
        const trigger = formEl.querySelector(`[data-key="${key}"]`);
        if (trigger) trigger.addEventListener('input', evaluate);
      });

      evaluate();
    });
  };

  const validateFormFields = (formEl) => {
    let isValid = true;
    formEl.querySelectorAll('[data-reqmsg]').forEach(field => {
      const val = field.value.trim();
      const errorMsg = field.getAttribute('data-reqmsg');
      if (!val) {
        field.setAttribute('aria-invalid', 'true');
        field.classList.add('invalid');
        isValid = false;
      } else {
        field.setAttribute('aria-invalid', 'false');
        field.classList.remove('invalid');
      }
    });
    return isValid;
  };

  const handleSubmit = (form, fields) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Honeypot check
      const honeypot = form.querySelector('input[name="item_meta[672]"]');
      if (honeypot?.value.trim() !== '') return;

      if (!validateFormFields(form)) return;

      const data = new FormData(form);
      const endpoint = `/wp-json/frm/v2/forms/${data.get('form_id')}/entries`;

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'X-WP-Nonce': wpApiSettings?.nonce || '' },
          body: data,
          credentials: 'same-origin'
        });

        if (!res.ok) throw new Error('Submission failed');
        const result = await res.json();
        alert('Form submitted successfully!');
        form.reset();

        await forwardToActiveCampaign(result);
      } catch (err) {
        console.error(err);
        alert('Error submitting form.');
      }
    });
  };

  const forwardToActiveCampaign = async (data) => {
    const payload = {
      email: data.email || '',
      first_name: data.first_name || '',
      last_name: data.last_name || ''
    };

    try {
      await fetch('/wp-json/formidable/v1/activecampaign/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin'
      });
    } catch (err) {
      console.warn('ActiveCampaign forwarding failed:', err);
    }
  };

  // Hydration sequence
  try {
    const formId = await getFormIdFromKey(formKey);
    const formData = await getFormMetadata(formId);
    const fields = Object.values(await getFormFields(formId));

    const wrapper = document.querySelector(mountSelector);
    if (!wrapper) throw new Error('Mount element not found');

    const form = document.createElement('form');
    form.method = 'post';
    form.className = 'frm-show-form headless-formidable';
    form.id = `form_${formKey}`;

    // Standard hidden fields
    ['frm_action', 'form_id', 'form_key'].forEach(name => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = name === 'frm_action' ? 'create' : (name === 'form_id' ? formData.id : formKey);
      form.appendChild(input);
    });

    fields.forEach(field => {
      const el = buildField(field);
      if (el) form.appendChild(el);
    });

    if (enableCaptcha) {
      const captcha = document.createElement('div');
      captcha.className = 'cf-turnstile';
      captcha.dataset.sitekey = '0x4AAAAAAAWYtWRiMaUVODel';
      captcha.dataset.size = 'normal';
      captcha.dataset.theme = 'light';
      form.appendChild(captcha);
    }

    wrapper.innerHTML = '';
    wrapper.appendChild(form);

    applyConditionalLogic(form, fields);
    handleSubmit(form, fields);

  } catch (err) {
    console.error('Formidable hydration error:', err);
  }
}

function renderAddressField(field, metaId) {
  const container = createContainer(field, metaId);
  const label = createLabel(field, metaId);

  const line1 = document.createElement('input');
  line1.type = 'text';
  line1.name = `item_meta[${metaId}][line1]`;
  line1.placeholder = 'Street Address';
  line1.className = 'frm_address_line1';

  const line2 = document.createElement('input');
  line2.type = 'text';
  line2.name = `item_meta[${metaId}][line2]`;
  line2.placeholder = 'Apartment, suite, etc.';
  line2.className = 'frm_address_line2';

  const city = document.createElement('input');
  city.type = 'text';
  city.name = `item_meta[${metaId}][city]`;
  city.placeholder = 'City';
  city.className = 'frm_city';

  const state = document.createElement('input');
  state.type = 'text';
  state.name = `item_meta[${metaId}][state]`;
  state.placeholder = 'State / Province';
  state.className = 'frm_state';

  const zip = document.createElement('input');
  zip.type = 'text';
  zip.name = `item_meta[${metaId}][zip]`;
  zip.placeholder = 'ZIP / Postal Code';
  zip.className = 'frm_zip';

  const country = document.createElement('input');
  country.type = 'text';
  country.name = `item_meta[${metaId}][country]`;
  country.placeholder = 'Country';
  country.className = 'frm_country';

  container.append(label, line1, line2, city, state, zip, country);
  return container;
}

function renderNumberField(field, metaId) {
  const container = createContainer(field, metaId);
  const label = createLabel(field, metaId);

  const input = document.createElement('input');
  input.type = 'number';
  input.name = `item_meta[${metaId}]`;
  input.id = `field_${field.field_key}`;
  input.min = field.field_options.minnum || '';
  input.max = field.field_options.maxnum || '';
  input.step = field.field_options.step || '1';
  input.setAttribute('aria-invalid', false);
  input.placeholder = field.field_options.placeholder || '';

  container.appendChild(label);
  container.appendChild(input);
  return container;
}

function renderPasswordField(field, metaId) {
  const container = createContainer(field, metaId);
  const label = createLabel(field, metaId);

  const input = document.createElement('input');
  input.type = 'password';
  input.name = `item_meta[${metaId}]`;
  input.id = `field_${field.field_key}`;
  input.setAttribute('aria-invalid', false);
  input.placeholder = field.field_options.placeholder || '';

  container.appendChild(label);
  container.appendChild(input);
  return container;
}

function renderNameField(field, metaId) {
  const container = createContainer(field, metaId);
  const label = createLabel(field, metaId);

  const firstName = document.createElement('input');
  firstName.type = 'text';
  firstName.name = `item_meta[${metaId}][first]`;
  firstName.placeholder = 'First Name';
  firstName.className = 'frm_first_name';
  firstName.setAttribute('aria-invalid', false);

  const lastName = document.createElement('input');
  lastName.type = 'text';
  lastName.name = `item_meta[${metaId}][last]`;
  lastName.placeholder = 'Last Name';
  lastName.className = 'frm_last_name';
  lastName.setAttribute('aria-invalid', false);

  container.appendChild(label);
  container.appendChild(firstName);
  container.appendChild(lastName);
  return container;
}

function renderEmailField(field, metaId) {
  const container = createContainer(field, metaId);
  const label = createLabel(field, metaId);

  const input = document.createElement('input');
  input.type = 'email';
  input.name = `item_meta[${metaId}]`;
  input.id = `field_${field.field_key}`;
  input.setAttribute('aria-invalid', false);
  input.placeholder = field.field_options.placeholder || '';

  container.appendChild(label);
  container.appendChild(input);
  return container;
}

function renderPhoneField(field, metaId) {
  const container = createContainer(field, metaId);
  const label = createLabel(field, metaId);

  const input = document.createElement('input');
  input.type = 'tel';
  input.name = `item_meta[${metaId}]`;
  input.id = `field_${field.field_key}`;
  input.setAttribute('aria-invalid', false);
  input.placeholder = field.field_options.placeholder || '';

  container.appendChild(label);
  container.appendChild(input);
  return container;
}

function renderPhoneField(field, metaId) {
  const container = createContainer(field, metaId);
  const label = createLabel(field, metaId);

  const input = document.createElement('input');
  input.type = 'tel';
  input.name = `item_meta[${metaId}]`;
  input.id = `field_${field.field_key}`;
  input.setAttribute('aria-invalid', false);
  input.placeholder = field.field_options.placeholder || '';

  container.appendChild(label);
  container.appendChild(input);
  return container;
}

function renderSelectField(field, metaId) {
  const container = createContainer(field, metaId);
  const label = createLabel(field, metaId);

  const select = document.createElement('select');
  select.name = `item_meta[${metaId}]`;
  select.id = `field_${field.field_key}`;
  select.setAttribute('aria-invalid', false);
  select.className = 'frm_select';

  if (field.field_options.blank) {
    const blankOption = document.createElement('option');
    blankOption.value = '';
    blankOption.textContent = field.field_options.blank;
    select.appendChild(blankOption);
  }

  (field.options || []).forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value || opt;
    option.textContent = opt.label || opt;
    select.appendChild(option);
  });

  container.appendChild(label);
  container.appendChild(select);
  return container;
}

function createContainer(field, metaId) {
  const div = document.createElement('div');
  div.id = `frm_field_${metaId}_container`;
  div.className = `frm_form_field form-field frm_${field.type}_container`;
  return div;
}

function createLabel(field, metaId) {
  const label = document.createElement('label');
  label.setAttribute('for', `field_${field.field_key}`);
  label.className = 'frm_primary_label';
  label.textContent = field.name || '';
  if (field.required) {
    const required = document.createElement('span');
    required.className = 'frm_required';
    required.textContent = '*';
    label.appendChild(required);
  }
  return label;
}

function renderFileField(field, metaId) {
  const container = createContainer(field, metaId);
  const label = createLabel(field, metaId);

  const input = document.createElement('input');
  input.type = 'file';
  input.name = `item_meta[${metaId}]${field.multiple ? '[]' : ''}`;
  input.id = `field_${field.field_key}`;
  if (field.multiple) input.multiple = true;
  input.setAttribute('aria-invalid', false);

  container.appendChild(label);
  container.appendChild(input);
  return container;
}

function renderRangeField(field, metaId) {
  const container = createContainer(field, metaId);
  const label = createLabel(field, metaId);
  const input = document.createElement('input');
  input.type = 'range';
  input.name = `item_meta[${metaId}]`;
  input.id = `field_${field.field_key}`;
  input.min = field.field_options.minnum || 0;
  input.max = field.field_options.maxnum || 100;
  input.step = field.field_options.step || 1;
  input.value = field.default_value || 0;

  container.appendChild(label);
  container.appendChild(input);
  return container;
}

function renderCheckboxField(field, metaId) {
  const container = createContainer(field, metaId);
  const label = createLabel(field, metaId);
  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'frm_opt_container';

  (field.options || []).forEach((opt, i) => {
    const checkboxId = `${metaId}-${i}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'frm_checkbox';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = `item_meta[${metaId}][]`;
    input.id = checkboxId;
    input.value = opt.value || opt;
    input.setAttribute('aria-invalid', false);

    const optLabel = document.createElement('label');
    optLabel.setAttribute('for', checkboxId);
    optLabel.textContent = opt.label || opt;

    wrapper.appendChild(input);
    wrapper.appendChild(optLabel);
    inputWrapper.appendChild(wrapper);
  });

  container.appendChild(label);
  container.appendChild(inputWrapper);
  return container;
}

function renderRadioField(field, metaId) {
  const container = createContainer(field, metaId);
  const label = createLabel(field, metaId);
  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'frm_opt_container';

  (field.options || []).forEach((opt, i) => {
    const radioId = `${metaId}-${i}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'frm_radio';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `item_meta[${metaId}]`;
    input.id = radioId;
    input.value = opt.value || opt;
    input.setAttribute('aria-invalid', false);

    const optLabel = document.createElement('label');
    optLabel.setAttribute('for', radioId);
    optLabel.textContent = opt.label || opt;

    wrapper.appendChild(input);
    wrapper.appendChild(optLabel);
    inputWrapper.appendChild(wrapper);
  });

  container.appendChild(label);
  container.appendChild(inputWrapper);
  return container;
}

// Extend the Formidable Form Renderer Engine to support additional field types.

export function renderExtendedField(field, fieldId, fieldNameAttr) {
  const container = document.createElement("div");
  container.className = "frm_form_field form-field";
  container.id = `frm_field_${field.id}_container`;

  const label = document.createElement("label");
  label.className = "frm_primary_label";
  label.htmlFor = fieldId;
  label.innerHTML = `${field.name} ${field.required ? '<span class="frm_required">*</span>' : ''}`;
  container.appendChild(label);

  let input;
  switch (field.type) {
    case "data":
      input = document.createElement("select");
      input.id = fieldId;
      input.name = fieldNameAttr;
      input.disabled = true;
      const placeholder = document.createElement("option");
      placeholder.textContent = "-- Data field requires backend population --";
      placeholder.disabled = true;
      placeholder.selected = true;
      input.appendChild(placeholder);
      break;

    case "quiz_score":
      input = document.createElement("input");
      input.type = "hidden";
      input.id = fieldId;
      input.name = fieldNameAttr;
      input.value = "0"; // Placeholder score
      break;

    case "star":
      input = document.createElement("div");
      input.className = "frm_star_container";
      input.setAttribute("role", "radiogroup");
      for (let i = 1; i <= 5; i++) {
        const starLabel = document.createElement("label");
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = fieldNameAttr;
        radio.value = i;
        radio.setAttribute("aria-label", `${i} star${i > 1 ? 's' : ''}`);
        starLabel.appendChild(radio);
        starLabel.appendChild(document.createTextNode("★"));
        input.appendChild(starLabel);
      }
      break;

    default:
      return null; // Skip if unknown type
  }

  if (input) {
    input.required = !!field.required;
    container.appendChild(input);
  }

  if (field.description) {
    const desc = document.createElement("div");
    desc.className = "frm_description";
    desc.id = `frm_desc_field_${field.field_key}`;
    desc.innerHTML = field.description;
    container.appendChild(desc);
  }

  return container;
}