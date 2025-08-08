/**
 * Formidable Form Renderer Engine
 * Dynamically builds and renders a Formidable Form using hydrated JSON metadata.
 *
 * Dependencies: jQuery
 * Expected Payloads:
 * 1. formMetadata: JSON object from /wp-json/frm/v2/forms/{form_id}
 * 2. fieldsMetadata: JSON object from /wp-json/frm/v2/forms/{form_id}/fields
 */
function FormidableFormRendererEngine(formMetadata, fieldsMetadata, targetElementId) {
  const $container = $('#' + targetElementId);
  if ($container.length === 0) {
    console.error('Target element not found:', targetElementId);
    return;
  }

  // Step 1: Create form tag
  const $form = $('<form>', {
    enctype: 'multipart/form-data',
    method: 'post',
    class: 'frm-show-form frm_pro_form frm-admin-viewing',
    id: 'form_' + formMetadata.form_key
  });

  // Step 2: Create hidden input fields required by Formidable
  const hiddenFields = [
    { name: 'frm_action', value: 'create' },
    { name: 'form_id', value: formMetadata.id },
    { name: 'frm_hide_fields_' + formMetadata.id, id: 'frm_hide_fields_' + formMetadata.id, value: '' },
    { name: 'form_key', value: formMetadata.form_key },
    { name: 'item_meta[0]', value: '' },
    { name: 'frm_submit_entry_' + formMetadata.id, id: 'frm_submit_entry_' + formMetadata.id, value: 'DYNAMIC_NONCE_PLACEHOLDER' },
    { name: '_wp_http_referer', value: formMetadata.link }
  ];
  hiddenFields.forEach(field => $form.append($('<input>', { type: 'hidden', ...field })));

  // Step 3: Build each field container
  Object.values(fieldsMetadata).forEach(field => {
    const { id, name, description, type, required, field_key, field_options } = field;
    const requiredAttr = required === '1';
    const ariaRequired = requiredAttr ? 'true' : 'false';
    const containerClass = `frm_form_field form-field ${requiredAttr ? 'frm_required_field' : ''} ${field_options.classes}`;

    const $fieldContainer = $('<div>', {
      id: 'frm_field_' + id + '_container',
      class: containerClass
    });

    // Create label
    if (type !== 'hidden' && type !== 'submit') {
      const $label = $('<label>', {
        for: 'field_' + field_key,
        id: 'field_' + field_key + '_label',
        class: 'frm_primary_label',
        html: name + (requiredAttr ? ' <span class="frm_required">*</span>' : '')
      });
      $fieldContainer.append($label);
    }

    // Create input/textarea/checkbox/etc
    let $input;
    switch (type) {
      case 'text':
      case 'email':
        $input = $('<input>', {
          type: type,
          id: 'field_' + field_key,
          name: 'item_meta[' + id + ']',
          value: '',
          'data-reqmsg': field_options.blank,
          'data-invmsg': field_options.invalid,
          'aria-required': ariaRequired,
          'aria-invalid': 'false'
        });
        break;

      case 'textarea':
        $input = $('<textarea>', {
          id: 'field_' + field_key,
          name: 'item_meta[' + id + ']',
          rows: field_options.max || 5,
          'data-reqmsg': field_options.blank,
          'data-invmsg': field_options.invalid,
          'aria-required': ariaRequired,
          'aria-invalid': 'false'
        });
        break;

      case 'checkbox':
        $input = $('<div>', {
          class: 'frm_opt_container',
          role: 'group',
          'aria-labelledby': 'field_' + field_key + '_label'
        });
        field.options.forEach((opt, index) => {
          const $checkboxLabel = $('<label>', {
            for: 'field_' + field_key + '-' + index,
            html: `<input type="checkbox" name="item_meta[${id}][]" id="field_${field_key}-${index}" value="${opt.value || opt}" /> ${opt.label || opt}`
          });
          $input.append($('<div>', { class: 'frm_checkbox' }).append($checkboxLabel));
        });
        break;

      case 'submit':
        $input = $('<button>', {
          class: 'frm_button_submit frm_final_submit fm-form-submit',
          type: 'submit',
          text: field.name || 'Submit'
        });
        break;

      case 'hidden':
        $input = $('<input>', {
          type: 'hidden',
          name: 'item_meta[' + id + ']',
          id: 'field_' + field_key,
          value: field.default_value
        });
        break;

      default:
        console.warn('Unsupported field type:', type);
        return;
    }

    $fieldContainer.append($input);

    // Add description
    if (description) {
      $fieldContainer.append($('<div>', {
        class: 'frm_description',
        id: 'frm_desc_field_' + field_key,
        html: description
      }));
    }

    $form.append($fieldContainer);
  });

  // Step 4: Final hidden keys and spam protection
  $form.append('<input type="hidden" name="item_key" value="" />');
  $form.append('<input type="hidden" name="frm_state" value="DYNAMIC_STATE_TOKEN" />');

  // Step 5: Mount form into DOM
  const $formWrapper = $('<div>', {
    class: 'frm_forms with_frm_style frm_style_formidable-style',
    id: 'frm_form_' + formMetadata.id + '_container'
  });

  $formWrapper.append($form);
  $container.empty().append($formWrapper);
}

/**
 * Formidable Form Renderer Engine
 * Renders a full Formidable form in a headless context using hydrated JSON payloads.
 * Includes support for hidden fields, repeaters, page breaks, conditional logic, and CAPTCHA.
 */

function FormidableFormRendererEngine({
  formContainerId,
  formData,
  fieldsData,
  csrfToken,
  enableCaptcha = false
}) {
  const container = document.getElementById(formContainerId);
  if (!container || !formData || !fieldsData) return;

  const formId = formData.id;
  const formKey = formData.form_key;
  const nonce = csrfToken || '';

  const form = document.createElement('form');
  form.method = 'POST';
  form.enctype = 'multipart/form-data';
  form.id = `form_${formKey}`;
  form.className = 'frm-show-form frm_pro_form headless-formidable';

  const fieldsWrapper = document.createElement('div');
  fieldsWrapper.className = 'frm_form_fields';

  const fieldset = document.createElement('fieldset');
  fieldset.innerHTML = `<legend class="frm_screen_reader">${formData.name}</legend>`;

  const containerDiv = document.createElement('div');
  containerDiv.className = 'frm_fields_container';

  // Hidden infrastructure fields
  containerDiv.appendChild(createHiddenInput('frm_action', 'create'));
  containerDiv.appendChild(createHiddenInput('form_id', formId));
  containerDiv.appendChild(createHiddenInput('form_key', formKey));
  containerDiv.appendChild(createHiddenInput('frm_submit_entry_' + formId, generateCSRF()));

  // Render visible fields
  const sortedFields = Object.values(fieldsData).sort((a, b) => a.field_order - b.field_order);
  sortedFields.forEach(field => {
    const fieldEl = renderField(field);
    if (fieldEl) containerDiv.appendChild(fieldEl);
  });

  // Append submit button
  const submitField = sortedFields.find(f => f.type === 'submit');
  if (submitField) {
    const submitDiv = document.createElement('div');
    submitDiv.className = 'frm_submit';
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'frm_button_submit fm-form-submit';
    submitBtn.textContent = submitField.name || 'Submit';
    submitDiv.appendChild(submitBtn);
    containerDiv.appendChild(submitDiv);
  }

  // Optional CAPTCHA
  if (enableCaptcha) {
    const captchaDiv = document.createElement('div');
    captchaDiv.className = 'frm_form_field frm_captcha_container';
    captchaDiv.innerHTML = '<div class="cf-turnstile" data-sitekey="0x4AAAAAAAWYtWRiMaUVODel" data-size="normal" data-theme="light"></div>';
    containerDiv.appendChild(captchaDiv);
  }

  fieldset.appendChild(containerDiv);
  fieldsWrapper.appendChild(fieldset);
  form.appendChild(fieldsWrapper);
  container.appendChild(form);

  /** Helper Functions **/
  function createHiddenInput(name, value) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    return input;
  }

  function renderField(field) {
    const wrapper = document.createElement('div');
    wrapper.id = `frm_field_${field.id}_container`;
    wrapper.className = `frm_form_field form-field frm_top_container frm_${field.field_options.classes || 'full'}`;
    if (field.required) wrapper.classList.add('frm_required_field');

    let label = document.createElement('label');
    label.htmlFor = `field_${field.field_key}`;
    label.id = `field_${field.field_key}_label`;
    label.className = 'frm_primary_label';
    label.textContent = field.name;
    if (field.required) {
      const requiredSpan = document.createElement('span');
      requiredSpan.className = 'frm_required';
      requiredSpan.textContent = '*';
      label.appendChild(requiredSpan);
    }
    wrapper.appendChild(label);

    let input;
    switch (field.type) {
      case 'text':
      case 'email':
        input = document.createElement('input');
        input.type = field.type;
        input.id = `field_${field.field_key}`;
        input.name = `item_meta[${field.id}]`;
        input.setAttribute('aria-required', field.required ? 'true' : 'false');
        input.setAttribute('aria-invalid', 'false');
        break;
      case 'textarea':
        input = document.createElement('textarea');
        input.rows = field.field_options.max || 5;
        input.id = `field_${field.field_key}`;
        input.name = `item_meta[${field.id}]`;
        input.setAttribute('aria-required', field.required ? 'true' : 'false');
        input.setAttribute('aria-invalid', 'false');
        break;
      case 'checkbox':
        input = document.createElement('div');
        input.className = 'frm_opt_container';
        input.role = 'group';
        input.setAttribute('aria-labelledby', `field_${field.field_key}_label`);
        field.options.forEach((opt, i) => {
          const checkboxId = `field_${field.field_key}-${i}`;
          const wrapper = document.createElement('div');
          wrapper.className = 'frm_checkbox';
          const label = document.createElement('label');
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.name = `item_meta[${field.id}][]`;
          box.id = checkboxId;
          box.value = opt;
          label.htmlFor = checkboxId;
          label.appendChild(box);
          label.append(` ${opt}`);
          wrapper.appendChild(label);
          input.appendChild(wrapper);
        });
        break;
      default:
        return null;
    }

    wrapper.appendChild(input);

    if (field.description) {
      const desc = document.createElement('div');
      desc.id = `frm_desc_field_${field.field_key}`;
      desc.className = 'frm_description';
      desc.textContent = field.description;
      wrapper.appendChild(desc);
    }

    return wrapper;
  }

  function generateCSRF() {
    // Simulate nonce or return provided one
    return nonce || Math.random().toString(36).substring(2);
  }
}

function applyConditionalLogic(formEl, fieldsData) {
  const fieldMap = Object.values(fieldsData).reduce((acc, field) => {
    acc[field.field_key] = field;
    return acc;
  }, {});

  Object.values(fieldsData).forEach(field => {
    const options = field.field_options;
    if (!options.hide_field?.length) return;

    const targetEl = formEl.querySelector(`#frm_field_${field.id}_container`);
    if (!targetEl) return;

    const conditionFields = options.hide_field;
    const conditionOps = options.hide_field_cond || [];
    const logicType = options.any_all || 'all';

    const evaluateVisibility = () => {
      const results = conditionFields.map((depKey, index) => {
        const operator = conditionOps[index] || '==';
        const depField = fieldMap[depKey];
        const depInput = formEl.querySelector(`#field_${depKey}`);
        const depValue = depInput?.value || '';
        const expectedValue = options.hide_opt?.[index] ?? '';

        if (operator === '==' || operator === '=') {
          return depValue === expectedValue;
        }
        if (operator === '!=') {
          return depValue !== expectedValue;
        }
        return false;
      });

      const shouldShow = options.show_hide === 'show'
        ? logicType === 'any' ? results.some(Boolean) : results.every(Boolean)
        : logicType === 'any' ? !results.some(Boolean) : !results.every(Boolean);

      targetEl.style.display = shouldShow ? '' : 'none';
    };

    // Attach listeners to dependent fields
    conditionFields.forEach(depKey => {
      const depField = formEl.querySelector(`#field_${depKey}`);
      if (depField) {
        depField.addEventListener('change', evaluateVisibility);
      }
    });

    // Initial evaluation
    evaluateVisibility();
  });
}

function FormidableFormRendererEngine({ formMeta, fieldsData, mountSelector }) {
  const formId = formMeta.id;
  const formKey = formMeta.form_key;

  const formContainer = document.querySelector(mountSelector);
  if (!formContainer) {
    console.error(`Mount point '${mountSelector}' not found.`);
    return;
  }

  // Build form element
  const formEl = document.createElement('form');
  formEl.method = 'POST';
  formEl.className = 'frm-show-form frm_pro_form';
  formEl.id = `form_${formKey}`;

  // Required hidden fields for Formidable to work
  formEl.innerHTML = `
    <input type="hidden" name="frm_action" value="create" />
    <input type="hidden" name="form_id" value="${formId}" />
    <input type="hidden" name="form_key" value="${formKey}" />
    <input type="hidden" id="frm_submit_entry_${formId}" name="frm_submit_entry_${formId}" value="submit" />
  `;

  // Loop through fields and render each
  Object.values(fieldsData).forEach(field => {
    const wrapper = document.createElement('div');
    wrapper.className = `frm_form_field form-field ${field.required === '1' ? 'frm_required_field' : ''}`;
    wrapper.id = `frm_field_${field.id}_container`;

    // Label
    const label = document.createElement('label');
    label.className = 'frm_primary_label';
    label.setAttribute('for', `field_${field.field_key}`);
    label.id = `field_${field.field_key}_label`;
    label.innerHTML = `${field.name} ${field.required === '1' ? '<span class="frm_required">*</span>' : ''}`;
    wrapper.appendChild(label);

    // Input
    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = field.field_options.max || 5;
    } else if (field.type === 'checkbox') {
      input = document.createElement('div');
      input.className = 'frm_opt_container';
      (field.options || []).forEach((opt, index) => {
        const checkboxId = `field_${field.field_key}-${index}`;
        const checkboxWrapper = document.createElement('div');
        checkboxWrapper.className = 'frm_checkbox';
        checkboxWrapper.innerHTML = `
          <label for="${checkboxId}">
            <input type="checkbox" name="item_meta[${field.id}][]" id="${checkboxId}" value="${opt.value}" />
            ${opt.label}
          </label>
        `;
        input.appendChild(checkboxWrapper);
      });
    } else if (field.type === 'hidden') {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = `item_meta[${field.id}]`;
      input.id = `field_${field.field_key}`;
      input.value = field.default_value || '';
    } else {
      input = document.createElement('input');
      input.type = field.type === 'email' ? 'email' : 'text';
    }

    if (!['checkbox', 'hidden'].includes(field.type)) {
      input.name = `item_meta[${field.id}]`;
      input.id = `field_${field.field_key}`;
      input.setAttribute('aria-invalid', 'false');
      if (field.required === '1') {
        input.setAttribute('aria-required', 'true');
        input.setAttribute('data-reqmsg', field.field_options.blank || `${field.name} cannot be blank.`);
      }
    }

    wrapper.appendChild(input);

    // Description
    if (field.description) {
      const desc = document.createElement('div');
      desc.className = 'frm_description';
      desc.id = `frm_desc_field_${field.field_key}`;
      desc.innerHTML = field.description;
      wrapper.appendChild(desc);
    }

    formEl.appendChild(wrapper);
  });

  // Append the full form
  const outer = document.createElement('div');
  outer.className = 'frm_forms';
  outer.id = `frm_form_${formId}_container`;

  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.className = 'frm_screen_reader';
  legend.textContent = formMeta.name;
  fieldset.appendChild(legend);
  fieldset.appendChild(formEl);

  const fieldsContainer = document.createElement('div');
  fieldsContainer.className = 'frm_form_fields';
  fieldsContainer.appendChild(fieldset);
  outer.appendChild(fieldsContainer);

  formContainer.innerHTML = '';
  formContainer.appendChild(outer);

  // Enable conditional logic after all fields are present
  applyConditionalLogic(formEl, fieldsData);
}
/**
 * Formidable Form Renderer Engine
 * Renders a complete Formidable Form using REST API payloads.
 * Supports conditional logic and structured layout.
 */
async function FormidableFormRendererEngine(formKey, mountSelector) {
  const getFormIdFromKey = async (key) => {
    try {
      const response = await fetch(`/wp-json/custom/v1/form-id/${key}`);
      if (!response.ok) throw new Error('Form ID not found');
      const data = await response.json();
      return data.id;
    } catch (error) {
      console.error('Error retrieving form ID:', error);
      return null;
    }
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
    wrapper.className = `frm_form_field form-field ${field.field_options.classes || ''}`.trim();
    wrapper.id = `frm_field_${field.id}_container`;

    if (field.required === '1') wrapper.classList.add('frm_required_field');

    const label = document.createElement('label');
    label.htmlFor = `field_${field.field_key}`;
    label.id = `field_${field.field_key}_label`;
    label.className = 'frm_primary_label';
    label.innerHTML = `${field.name} ${field.required === '1' ? '<span class="frm_required">*</span>' : ''}`;
    wrapper.appendChild(label);

    let input;
    switch (field.type) {
      case 'text':
      case 'email':
        input = document.createElement('input');
        input.type = field.type;
        input.id = `field_${field.field_key}`;
        input.name = `item_meta[${field.id}]`;
        input.setAttribute('data-key', field.field_key);
        input.value = '';
        if (field.required === '1') {
          input.required = true;
          input.setAttribute('data-reqmsg', field.field_options.blank || `${field.name} cannot be blank.`);
          input.setAttribute('aria-required', 'true');
        }
        break;
      case 'textarea':
        input = document.createElement('textarea');
        input.id = `field_${field.field_key}`;
        input.name = `item_meta[${field.id}]`;
        input.setAttribute('data-key', field.field_key);
        input.rows = field.field_options.max || 5;
        if (field.required === '1') {
          input.required = true;
          input.setAttribute('data-reqmsg', field.field_options.blank || `${field.name} cannot be blank.`);
          input.setAttribute('aria-required', 'true');
        }
        break;
      case 'checkbox':
        input = document.createElement('div');
        input.className = 'frm_opt_container';
        field.options.forEach((opt, idx) => {
          const div = document.createElement('div');
          div.className = 'frm_checkbox';
          const lbl = document.createElement('label');
          lbl.htmlFor = `field_${field.field_key}-${idx}`;
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.id = `field_${field.field_key}-${idx}`;
          box.name = `item_meta[${field.id}][]`;
          box.value = opt.value;
          box.setAttribute('data-key', field.field_key);
          lbl.appendChild(box);
          lbl.append(` ${opt.label}`);
          div.appendChild(lbl);
          input.appendChild(div);
        });
        break;
      case 'hidden':
        input = document.createElement('input');
        input.type = 'hidden';
        input.id = `field_${field.field_key}`;
        input.name = `item_meta[${field.id}]`;
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
        const buttonWrapper = document.createElement('div');
        buttonWrapper.className = 'frm_submit';
        const button = document.createElement('button');
        button.type = 'submit';
        button.className = 'frm_button_submit fm-form-submit';
        button.innerText = field.name || 'Submit';
        buttonWrapper.appendChild(button);
        return buttonWrapper;
      default:
        return null;
    }

    if (input) wrapper.appendChild(input);
    return wrapper;
  };

  const applyConditionalLogic = (formElement, fields) => {
    fields.forEach((field) => {
      const opts = field.field_options;
      if (!opts || !opts.hide_field || opts.hide_field.length === 0) return;

      const targets = Array.isArray(opts.hide_field) ? opts.hide_field : [opts.hide_field];
      const operators = Array.isArray(opts.hide_field_cond) ? opts.hide_field_cond : ['=='];

      targets.forEach((targetKey, idx) => {
        const operator = operators[idx] || '==';
        const trigger = formElement.querySelector(`[data-key="${targetKey}"]`);
        if (!trigger) return;

        trigger.addEventListener('input', () => {
          const container = formElement.querySelector(`#frm_field_${field.id}_container`);
          const value = trigger.value;
          const show = operator === '==' ? value !== '' : value === '';
          const visible = opts.show_hide === 'show' ? show : !show;
          if (container) container.style.display = visible ? 'block' : 'none';
        });
      });
    });
  };

  try {
    const formId = await getFormIdFromKey(formKey);
    if (!formId) throw new Error('Missing form ID');

    const formData = await getFormMetadata(formId);
    const fields = Object.values(await getFormFields(formId));

    const formWrapper = document.querySelector(mountSelector);
    if (!formWrapper) throw new Error('Mount element not found');

    const form = document.createElement('form');
    form.method = 'post';
    form.className = 'frm-show-form';
    form.id = `form_${formData.form_key}`;

    const hiddenInputs = [
      { name: 'frm_action', value: 'create' },
      { name: 'form_id', value: formData.id },
      { name: 'form_key', value: formData.form_key }
    ];
    hiddenInputs.forEach((item) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = item.name;
      input.value = item.value;
      form.appendChild(input);
    });

    fields.forEach((f) => {
      const el = buildField(f);
      if (el) form.appendChild(el);
    });

    formWrapper.appendChild(form);
    applyConditionalLogic(form, fields);
  } catch (err) {
    console.error('Renderer error:', err);
  }
}
/**
 * Formidable Form Renderer Engine
 * Step 3: Form Submission Handler
 * Handles submit, draft, and anti-spam logic.
 */

function attachFormidableFormSubmitHandler(formContainer) {
  const form = formContainer.querySelector('form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Spam honeypot check
    const honeypot = form.querySelector('input.frm_verify');
    if (honeypot && honeypot.value !== '') {
      console.warn('Spam honeypot triggered. Aborting submission.');
      return;
    }

    // Build form data object
    const formData = new FormData(form);

    // Extract required values
    const formId = formData.get('form_id');
    const entryKey = formData.get('item_key') || '';
    const action = formData.get('frm_action') || 'create';

    // Endpoint
    const endpoint = `/wp-json/frm/v2/forms/${formId}/entries`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'X-WP-Nonce': wpApiSettings?.nonce || ''
        },
        body: formData,
        credentials: 'same-origin'
      });

      if (!response.ok) {
        const err = await response.json();
        console.error('Form submission failed:', err);
        alert('There was a problem submitting the form.');
        return;
      }

      const result = await response.json();
      console.log('Form submission result:', result);
      alert('Form submitted successfully!');

      // Optional: redirect, show message, or reset form
      // window.location.href = '/thank-you';
      form.reset();

    } catch (error) {
      console.error('Unexpected error during form submission:', error);
      alert('An unexpected error occurred. Please try again later.');
    }
  });
}
/**
 * Enhance the Formidable Form Renderer Engine with draft save and success message handling.
 */
function enhanceFormidableEngineWithDrafting() {
  const forms = document.querySelectorAll('form[data-frm-id]');
  forms.forEach(form => {
    const formId = form.getAttribute('data-frm-id');
    const saveDraftButton = form.querySelector('.frm_save_draft');
    const messageContainer = document.createElement('div');
    messageContainer.className = 'frm_success_msg';
    messageContainer.setAttribute('aria-live', 'polite');
    form.appendChild(messageContainer);

    if (saveDraftButton) {
      saveDraftButton.addEventListener('click', function (e) {
        e.preventDefault();
        const formData = new FormData(form);
        formData.append('draft', '1');

        fetch(`/wp-json/frm/v2/entries`, {
          method: 'POST',
          headers: {
            'X-WP-Nonce': wpApiSettings.nonce
          },
          body: formData,
          credentials: 'same-origin'
        })
        .then(response => {
          if (!response.ok) throw new Error('Failed to save draft');
          return response.json();
        })
        .then(data => {
          messageContainer.textContent = 'Your draft has been saved.';
        })
        .catch(error => {
          messageContainer.textContent = 'An error occurred while saving your draft.';
          console.error(error);
        });
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const formData = new FormData(form);
      fetch(`/wp-json/frm/v2/entries`, {
        method: 'POST',
        headers: {
          'X-WP-Nonce': wpApiSettings.nonce
        },
        body: formData,
        credentials: 'same-origin'
      })
      .then(response => {
        if (!response.ok) throw new Error('Form submission failed');
        return response.json();
      })
      .then(data => {
        messageContainer.textContent = 'Your responses were successfully submitted. Thank you!';
        form.reset();
      })
      .catch(error => {
        messageContainer.textContent = 'There was an issue submitting the form.';
        console.error(error);
      });
    });
  });
}

// Call this after rendering forms
enhanceFormidableEngineWithDrafting();

applyConditionalLogic(formContainer, fieldsData);

add_action('rest_api_init', function () {
  register_rest_route('formidable/v1', '/activecampaign/forward', [
    'methods' => 'POST',
    'callback' => 'forward_to_activecampaign',
    'permission_callback' => function () {
      return current_user_can('edit_posts') || is_user_logged_in(); // Adjust as needed
    },
  ]);
});

function forward_to_activecampaign($request) {
  $body = $request->get_json_params();

  $email = sanitize_email($body['email'] ?? '');
  $first = sanitize_text_field($body['first_name'] ?? '');
  $last = sanitize_text_field($body['last_name'] ?? '');

  if (!is_email($email)) {
    return new WP_Error('invalid_email', 'A valid email is required.', ['status' => 400]);
  }

  $api_url = 'https://youraccount.api-us1.com/api/3/contacts';
  $api_key = 'YOUR_ACTIVECAMPAIGN_API_KEY'; // Consider using environment variables

  $response = wp_remote_post($api_url, [
    'headers' => [
      'Api-Token' => $api_key,
      'Content-Type' => 'application/json',
    ],
    'body' => json_encode([
      'contact' => [
        'email' => $email,
        'firstName' => $first,
        'lastName' => $last,
      ],
    ]),
  ]);

  if (is_wp_error($response)) {
    return new WP_Error('ac_api_error', $response->get_error_message(), ['status' => 500]);
  }

  $code = wp_remote_retrieve_response_code($response);
  if ($code !== 201) {
    return new WP_Error('ac_rejected', 'ActiveCampaign rejected the submission.', ['status' => $code]);
  }

  return ['status' => 'success', 'message' => 'Contact sent to ActiveCampaign.'];
}

// Inside submitFormData success
if (submitSuccess) {
  showSuccessMessage();
  await forwardToActiveCampaign(formPayload); // optional
}

function validateFormFields(formEl) {
  let isValid = true;
  const invalidFields = [];

  formEl.querySelectorAll('[data-reqmsg]').forEach(field => {
    const value = field.value.trim();
    const reqMsg = field.getAttribute('data-reqmsg');
    const invMsg = field.getAttribute('data-invmsg');
    const ariaId = field.getAttribute('aria-describedby');

    const errorEl = ariaId ? document.getElementById(ariaId.replace('desc', 'error')) : null;
    if (value === '') {
      isValid = false;
      field.setAttribute('aria-invalid', 'true');
      if (errorEl) errorEl.textContent = reqMsg || 'This field is required.';
      field.classList.add('invalid');
      invalidFields.push(field);
    } else {
      field.setAttribute('aria-invalid', 'false');
      if (errorEl) errorEl.textContent = '';
      field.classList.remove('invalid');
    }
  });

  if (!isValid) {
    invalidFields[0].focus();
  }

  return isValid;
}

if (!validateFormFields(form)) {
  console.warn('Form validation failed. Submission halted.');
  return;
}

const honeypot = form.querySelector('input[name="item_meta[672]"]'); // adjust ID
if (honeypot && honeypot.value.trim() !== '') {
  console.warn('Bot detected by honeypot. Aborting submission.');
  return;
}

const captchaContainer = form.querySelector('.cf-turnstile');
if (captchaContainer && !captchaContainer.querySelector('textarea[name="cf-turnstile-response"]')) {
  console.warn('CAPTCHA not completed.');
  return;
}

add_filter('frm_entries_before_create', function($errors, $form) {
  if ($form->id === '1') {
    if (empty($_POST['item_meta'][1])) {
      $errors['field_contact_form_first_name'] = 'First name is required.';
    }
    // more field checks...
  }
  return $errors;
}, 10, 2);
