/**
 * Formidable Form Renderer Engine v2.0
 * Enterprise-grade rendering engine for headless Formidable Forms using REST API metadata.
 * Supports all 26 field types plus custom field registration
 * 
 * @author Headless WordPress, Formidable Power
 * @license MIT
 */

class FormidableFormRendererEngine {
  constructor() {
    this.fieldRenderers = new Map();
    this.initializeFieldRenderers();
  }

  /**
   * Initialize all built-in field renderers
   */
  initializeFieldRenderers() {
    // Text-based fields
    this.registerFieldRenderer('text', this.renderTextField);
    this.registerFieldRenderer('email', this.renderEmailField);
    this.registerFieldRenderer('url', this.renderUrlField);
    this.registerFieldRenderer('textarea', this.renderTextareaField);
    this.registerFieldRenderer('rte', this.renderRichTextEditorField);
    this.registerFieldRenderer('password', this.renderPasswordField);
    this.registerFieldRenderer('phone', this.renderPhoneField);
    
    // Number fields
    this.registerFieldRenderer('number', this.renderNumberField);
    this.registerFieldRenderer('range', this.renderRangeField);
    
    // Date/Time fields
    this.registerFieldRenderer('date', this.renderDateField);
    
    // Choice fields
    this.registerFieldRenderer('checkbox', this.renderCheckboxField);
    this.registerFieldRenderer('radio', this.renderRadioField);
    this.registerFieldRenderer('select', this.renderSelectField);
    
    // Complex fields
    this.registerFieldRenderer('name', this.renderNameField);
    this.registerFieldRenderer('address', this.renderAddressField);
    this.registerFieldRenderer('file', this.renderFileField);
    this.registerFieldRenderer('image', this.renderImageField);
    
    // Special fields
    this.registerFieldRenderer('hidden', this.renderHiddenField);
    this.registerFieldRenderer('captcha', this.renderCaptchaField);
    this.registerFieldRenderer('star', this.renderStarField);
    this.registerFieldRenderer('quiz_score', this.renderQuizScoreField);
    this.registerFieldRenderer('data', this.renderDataField);
    
    // Layout fields
    this.registerFieldRenderer('html', this.renderHtmlField);
    this.registerFieldRenderer('divider', this.renderDividerField);
    this.registerFieldRenderer('break', this.renderBreakField);
    this.registerFieldRenderer('end_divider', this.renderEndDividerField);
    this.registerFieldRenderer('summary', this.renderSummaryField);
    
    // Action fields
    this.registerFieldRenderer('submit', this.renderSubmitField);
  }

  /**
   * Register a custom field renderer
   * @param {string} fieldType - The field type identifier
   * @param {Function} renderer - The rendering function
   */
  registerFieldRenderer(fieldType, renderer) {
    this.fieldRenderers.set(fieldType, renderer.bind(this));
  }

  /**
   * Main rendering entry point
   */
  async render({ formKey, mountSelector, enableCaptcha = false, config = {} }) {
    try {
      // Merge default config
      const settings = {
        apiBase: config.apiBase || '/wp-json',
        nonce: config.nonce || window.wpApiSettings?.nonce || '',
        ...config
      };

      // Step 1: Get form ID from key
      const formId = await this.getFormIdFromKey(formKey, settings);
      
      // Step 2: Get form metadata
      const formData = await this.getFormMetadata(formId, settings);
      
      // Step 3: Get form fields
      const fields = await this.getFormFields(formId, settings);
      
      // Render the form
      this.renderForm(formData, fields, mountSelector, enableCaptcha, settings);
      
      return { success: true, formId, formData, fields };
    } catch (error) {
      console.error('Formidable Form Renderer Error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * API Methods
   */
  async getFormIdFromKey(key, settings) {
    const response = await fetch(`${settings.apiBase}/custom/v1/form-id/${key}`);
    if (!response.ok) throw new Error('Form ID not found');
    const data = await response.json();
    return data.id;
  }

  async getFormMetadata(formId, settings) {
    const response = await fetch(`${settings.apiBase}/frm/v2/forms/${formId}`);
    if (!response.ok) throw new Error('Form metadata not found');
    return await response.json();
  }

  async getFormFields(formId, settings) {
    const response = await fetch(`${settings.apiBase}/frm/v2/forms/${formId}/fields`);
    if (!response.ok) throw new Error('Form fields not found');
    const data = await response.json();
    return Object.values(data);
  }

  /**
   * Form Rendering
   */
  renderForm(formData, fields, mountSelector, enableCaptcha, settings) {
    const wrapper = document.querySelector(mountSelector);
    if (!wrapper) throw new Error('Mount element not found');

    const form = this.createFormElement(formData);
    
    // Add hidden fields
    this.addHiddenFields(form, formData);
    
    // Sort fields by field_order
    const sortedFields = fields.sort((a, b) => 
      parseInt(a.field_order) - parseInt(b.field_order)
    );
    
    // Render each field
    sortedFields.forEach(field => {
      const fieldElement = this.renderField(field);
      if (fieldElement) {
        form.appendChild(fieldElement);
      }
    });
    
    // Add optional captcha
    if (enableCaptcha && !fields.some(f => f.type === 'captcha')) {
      form.appendChild(this.createTurnstileCaptcha());
    }
    
    // Clear and append to wrapper
    wrapper.innerHTML = '';
    wrapper.appendChild(form);
    
    // Apply behaviors
    this.applyConditionalLogic(form, fields);
    this.attachSubmitHandler(form, formData, settings);
    this.initializeSpecialFields(form, fields);
  }

  createFormElement(formData) {
    const form = document.createElement('form');
    form.method = 'post';
    form.className = 'frm-show-form headless-formidable';
    form.id = `form_${formData.form_key}`;
    form.setAttribute('data-form-id', formData.id);
    return form;
  }

  addHiddenFields(form, formData) {
    const hiddenFields = {
      'frm_action': 'create',
      'form_id': formData.id,
      'form_key': formData.form_key
    };

    Object.entries(hiddenFields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });
  }

  /**
   * Field Rendering Dispatcher
   */
  renderField(field) {
    const renderer = this.fieldRenderers.get(field.type);
    if (renderer) {
      return renderer(field);
    }
    
    console.warn(`Unknown field type: ${field.type}`);
    return this.renderUnknownField(field);
  }

  /**
   * Base Field Container
   */
  createFieldContainer(field, additionalClasses = '') {
    const container = document.createElement('div');
    container.id = `frm_field_${field.id}_container`;
    container.className = [
      'frm_form_field',
      'form-field',
      `frm_${field.type}_container`,
      field.required === '1' ? 'frm_required_field' : '',
      field.field_options?.classes || '',
      additionalClasses
    ].filter(Boolean).join(' ');
    
    return container;
  }

  createFieldLabel(field) {
    if (field.field_options?.label === 'hidden' || field.field_options?.label === 'none') {
      return null;
    }

    const label = document.createElement('label');
    label.htmlFor = `field_${field.field_key}`;
    label.id = `field_${field.field_key}_label`;
    label.className = 'frm_primary_label';
    
    const labelText = document.createElement('span');
    labelText.textContent = field.name;
    label.appendChild(labelText);
    
    if (field.required === '1') {
      const required = document.createElement('span');
      required.className = 'frm_required';
      required.setAttribute('aria-label', 'required');
      required.textContent = field.field_options?.required_indicator || '*';
      label.appendChild(required);
    }
    
    return label;
  }

  createFieldDescription(field) {
    if (!field.description) return null;
    
    const desc = document.createElement('div');
    desc.id = `frm_desc_field_${field.field_key}`;
    desc.className = 'frm_description';
    desc.innerHTML = field.description;
    return desc;
  }

  /**
   * Text Field Renderers
   */
  renderTextField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const input = document.createElement('input');
    input.type = 'text';
    input.name = `item_meta[${field.id}]`;
    input.id = `field_${field.field_key}`;
    input.className = 'frm_text_input';
    this.applyFieldAttributes(input, field);
    
    if (label) container.appendChild(label);
    container.appendChild(input);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  renderEmailField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const input = document.createElement('input');
    input.type = 'email';
    input.name = `item_meta[${field.id}]`;
    input.id = `field_${field.field_key}`;
    input.className = 'frm_email_input';
    this.applyFieldAttributes(input, field);
    
    if (label) container.appendChild(label);
    container.appendChild(input);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  renderUrlField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const input = document.createElement('input');
    input.type = 'url';
    input.name = `item_meta[${field.id}]`;
    input.id = `field_${field.field_key}`;
    input.className = 'frm_url_input';
    this.applyFieldAttributes(input, field);
    
    if (label) container.appendChild(label);
    container.appendChild(input);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  renderTextareaField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const textarea = document.createElement('textarea');
    textarea.name = `item_meta[${field.id}]`;
    textarea.id = `field_${field.field_key}`;
    textarea.className = 'frm_textarea';
    textarea.rows = field.field_options?.max || 5;
    this.applyFieldAttributes(textarea, field);
    
    if (label) container.appendChild(label);
    container.appendChild(textarea);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  renderRichTextEditorField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    // For headless, we'll use a textarea with a data attribute to indicate RTE
    const textarea = document.createElement('textarea');
    textarea.name = `item_meta[${field.id}]`;
    textarea.id = `field_${field.field_key}`;
    textarea.className = 'frm_rte';
    textarea.setAttribute('data-rte', 'true');
    textarea.rows = field.field_options?.max || 10;
    this.applyFieldAttributes(textarea, field);
    
    if (label) container.appendChild(label);
    container.appendChild(textarea);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  renderPasswordField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const input = document.createElement('input');
    input.type = 'password';
    input.name = `item_meta[${field.id}]`;
    input.id = `field_${field.field_key}`;
    input.className = 'frm_password_input';
    this.applyFieldAttributes(input, field);
    
    if (label) container.appendChild(label);
    container.appendChild(input);
    
    // Add confirmation field if needed
    if (field.field_options?.conf_field === '1') {
      const confLabel = document.createElement('label');
      confLabel.htmlFor = `field_conf_${field.field_key}`;
      confLabel.className = 'frm_primary_label';
      confLabel.textContent = field.field_options?.conf_desc || 'Confirm Password';
      
      const confInput = document.createElement('input');
      confInput.type = 'password';
      confInput.name = `item_meta[conf_${field.id}]`;
      confInput.id = `field_conf_${field.field_key}`;
      confInput.className = 'frm_password_confirm';
      
      container.appendChild(confLabel);
      container.appendChild(confInput);
    }
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  renderPhoneField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const input = document.createElement('input');
    input.type = 'tel';
    input.name = `item_meta[${field.id}]`;
    input.id = `field_${field.field_key}`;
    input.className = 'frm_phone_input';
    this.applyFieldAttributes(input, field);
    
    if (label) container.appendChild(label);
    container.appendChild(input);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  /**
   * Number Field Renderers
   */
  renderNumberField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const input = document.createElement('input');
    input.type = 'number';
    input.name = `item_meta[${field.id}]`;
    input.id = `field_${field.field_key}`;
    input.className = 'frm_number_input';
    
    if (field.field_options?.minnum) input.min = field.field_options.minnum;
    if (field.field_options?.maxnum) input.max = field.field_options.maxnum;
    if (field.field_options?.step) input.step = field.field_options.step;
    
    this.applyFieldAttributes(input, field);
    
    if (label) container.appendChild(label);
    container.appendChild(input);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  renderRangeField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const rangeWrapper = document.createElement('div');
    rangeWrapper.className = 'frm_range_wrapper';
    
    const input = document.createElement('input');
    input.type = 'range';
    input.name = `item_meta[${field.id}]`;
    input.id = `field_${field.field_key}`;
    input.className = 'frm_range_input';
    input.min = field.field_options?.minnum || 0;
    input.max = field.field_options?.maxnum || 100;
    input.step = field.field_options?.step || 1;
    input.value = field.default_value || input.min;
    
    const output = document.createElement('output');
    output.htmlFor = input.id;
    output.className = 'frm_range_output';
    output.textContent = input.value;
    
    input.addEventListener('input', () => {
      output.textContent = input.value;
    });
    
    this.applyFieldAttributes(input, field);
    
    if (label) container.appendChild(label);
    rangeWrapper.appendChild(input);
    rangeWrapper.appendChild(output);
    container.appendChild(rangeWrapper);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  /**
   * Date/Time Field Renderers
   */
  renderDateField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const input = document.createElement('input');
    input.type = 'date';
    input.name = `item_meta[${field.id}]`;
    input.id = `field_${field.field_key}`;
    input.className = 'frm_date_input';
    
    if (field.field_options?.min_date) input.min = field.field_options.min_date;
    if (field.field_options?.max_date) input.max = field.field_options.max_date;
    
    this.applyFieldAttributes(input, field);
    
    if (label) container.appendChild(label);
    container.appendChild(input);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  /**
   * Choice Field Renderers
   */
  renderCheckboxField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const optContainer = document.createElement('div');
    optContainer.className = 'frm_opt_container';
    optContainer.setAttribute('role', 'group');
    if (label) optContainer.setAttribute('aria-labelledby', `field_${field.field_key}_label`);
    
    const options = field.options || [];
    options.forEach((opt, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'frm_checkbox';
      
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = `item_meta[${field.id}][]`;
      input.id = `field_${field.field_key}-${idx}`;
      input.value = typeof opt === 'object' ? opt.value : opt;
      input.setAttribute('data-key', field.field_key);
      
      const optLabel = document.createElement('label');
      optLabel.htmlFor = input.id;
      optLabel.textContent = typeof opt === 'object' ? opt.label : opt;
      
      wrapper.appendChild(input);
      wrapper.appendChild(optLabel);
      optContainer.appendChild(wrapper);
    });
    
    if (label) container.appendChild(label);
    container.appendChild(optContainer);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  renderRadioField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const optContainer = document.createElement('div');
    optContainer.className = 'frm_opt_container';
    optContainer.setAttribute('role', 'radiogroup');
    if (label) optContainer.setAttribute('aria-labelledby', `field_${field.field_key}_label`);
    
    const options = field.options || [];
    options.forEach((opt, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'frm_radio';
      
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `item_meta[${field.id}]`;
      input.id = `field_${field.field_key}-${idx}`;
      input.value = typeof opt === 'object' ? opt.value : opt;
      input.setAttribute('data-key', field.field_key);
      
      const optLabel = document.createElement('label');
      optLabel.htmlFor = input.id;
      optLabel.textContent = typeof opt === 'object' ? opt.label : opt;
      
      wrapper.appendChild(input);
      wrapper.appendChild(optLabel);
      optContainer.appendChild(wrapper);
    });
    
    if (label) container.appendChild(label);
    container.appendChild(optContainer);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  renderSelectField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const select = document.createElement('select');
    select.name = `item_meta[${field.id}]${field.field_options?.multiple ? '[]' : ''}`;
    select.id = `field_${field.field_key}`;
    select.className = 'frm_select';
    select.setAttribute('data-key', field.field_key);
    
    if (field.field_options?.multiple) {
      select.multiple = true;
      select.size = field.field_options?.size || 4;
    }
    
    // Add placeholder option
    if (field.field_options?.blank) {
      const blankOption = document.createElement('option');
      blankOption.value = '';
      blankOption.textContent = field.field_options.blank;
      blankOption.disabled = true;
      blankOption.selected = true;
      select.appendChild(blankOption);
    }
    
    // Add options
    const options = field.options || [];
    options.forEach(opt => {
      const option = document.createElement('option');
      option.value = typeof opt === 'object' ? opt.value : opt;
      option.textContent = typeof opt === 'object' ? opt.label : opt;
      select.appendChild(option);
    });
    
    this.applyFieldAttributes(select, field);
    
    if (label) container.appendChild(label);
    container.appendChild(select);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  /**
   * Complex Field Renderers
   */
  renderNameField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const nameWrapper = document.createElement('div');
    nameWrapper.className = 'frm_name_wrapper';
    
    // First Name
    const firstName = document.createElement('input');
    firstName.type = 'text';
    firstName.name = `item_meta[${field.id}][first]`;
    firstName.id = `field_${field.field_key}_first`;
    firstName.className = 'frm_first_name';
    firstName.placeholder = field.field_options?.first_placeholder || 'First';
    
    // Last Name
    const lastName = document.createElement('input');
    lastName.type = 'text';
    lastName.name = `item_meta[${field.id}][last]`;
    lastName.id = `field_${field.field_key}_last`;
    lastName.className = 'frm_last_name';
    lastName.placeholder = field.field_options?.last_placeholder || 'Last';
    
    // Optional Middle Name
    if (field.field_options?.middle_name) {
      const middleName = document.createElement('input');
      middleName.type = 'text';
      middleName.name = `item_meta[${field.id}][middle]`;
      middleName.id = `field_${field.field_key}_middle`;
      middleName.className = 'frm_middle_name';
      middleName.placeholder = field.field_options?.middle_placeholder || 'Middle';
      
      nameWrapper.appendChild(firstName);
      nameWrapper.appendChild(middleName);
      nameWrapper.appendChild(lastName);
    } else {
      nameWrapper.appendChild(firstName);
      nameWrapper.appendChild(lastName);
    }
    
    if (label) container.appendChild(label);
    container.appendChild(nameWrapper);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  renderAddressField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const addressWrapper = document.createElement('div');
    addressWrapper.className = 'frm_address_wrapper';
    
    // Line 1
    const line1 = document.createElement('input');
    line1.type = 'text';
    line1.name = `item_meta[${field.id}][line1]`;
    line1.id = `field_${field.field_key}_line1`;
    line1.className = 'frm_address_line1';
    line1.placeholder = 'Street Address';
    
    // Line 2
    const line2 = document.createElement('input');
    line2.type = 'text';
    line2.name = `item_meta[${field.id}][line2]`;
    line2.id = `field_${field.field_key}_line2`;
    line2.className = 'frm_address_line2';
    line2.placeholder = 'Apartment, suite, etc.';
    
    // City
    const city = document.createElement('input');
    city.type = 'text';
    city.name = `item_meta[${field.id}][city]`;
    city.id = `field_${field.field_key}_city`;
    city.className = 'frm_city';
    city.placeholder = 'City';
    
    // State
    const state = document.createElement('input');
    state.type = 'text';
    state.name = `item_meta[${field.id}][state]`;
    state.id = `field_${field.field_key}_state`;
    state.className = 'frm_state';
    state.placeholder = 'State / Province';
    
    // ZIP
    const zip = document.createElement('input');
    zip.type = 'text';
    zip.name = `item_meta[${field.id}][zip]`;
    zip.id = `field_${field.field_key}_zip`;
    zip.className = 'frm_zip';
    zip.placeholder = 'ZIP / Postal Code';
    
    // Country
    const country = document.createElement('input');
    country.type = 'text';
    country.name = `item_meta[${field.id}][country]`;
    country.id = `field_${field.field_key}_country`;
    country.className = 'frm_country';
    country.placeholder = 'Country';
    
    addressWrapper.appendChild(line1);
    addressWrapper.appendChild(line2);
    addressWrapper.appendChild(city);
    addressWrapper.appendChild(state);
    addressWrapper.appendChild(zip);
    addressWrapper.appendChild(country);
    
    if (label) container.appendChild(label);
    container.appendChild(addressWrapper);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  renderFileField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const input = document.createElement('input');
    input.type = 'file';
    input.name = `item_meta[${field.id}]${field.field_options?.multiple ? '[]' : ''}`;
    input.id = `field_${field.field_key}`;
    input.className = 'frm_file_input';
    
    if (field.field_options?.multiple) {
      input.multiple = true;
    }
    
    if (field.field_options?.accept) {
      input.accept = field.field_options.accept;
    }
    
    this.applyFieldAttributes(input, field);
    
    if (label) container.appendChild(label);
    container.appendChild(input);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  renderImageField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const input = document.createElement('input');
    input.type = 'file';
    input.name = `item_meta[${field.id}]${field.field_options?.multiple ? '[]' : ''}`;
    input.id = `field_${field.field_key}`;
    input.className = 'frm_image_input';
    input.accept = 'image/*';
    
    if (field.field_options?.multiple) {
      input.multiple = true;
    }
    
    // Add preview container
    const preview = document.createElement('div');
    preview.className = 'frm_image_preview';
    preview.id = `preview_${field.field_key}`;
    
    input.addEventListener('change', (e) => {
      this.handleImagePreview(e, preview);
    });
    
    this.applyFieldAttributes(input, field);
    
    if (label) container.appendChild(label);
    container.appendChild(input);
    container.appendChild(preview);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  /**
   * Special Field Renderers
   */
  renderHiddenField(field) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = `item_meta[${field.id}]`;
    input.id = `field_${field.field_key}`;
    input.value = field.default_value || '';
    input.setAttribute('data-key', field.field_key);
    return input;
  }

  renderCaptchaField(field) {
    const container = this.createFieldContainer(field);
    
    const captchaDiv = document.createElement('div');
    captchaDiv.id = `field_${field.field_key}`;
    captchaDiv.className = 'cf-turnstile';
    captchaDiv.dataset.sitekey = field.field_options?.site_key || '0x4AAAAAAAWYtWRiMaUVODel';
    captchaDiv.dataset.size = field.field_options?.captcha_size || 'normal';
    captchaDiv.dataset.theme = field.field_options?.captcha_theme || 'light';
    
    container.appendChild(captchaDiv);
    return container;
  }

  renderStarField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const starContainer = document.createElement('div');
    starContainer.className = 'frm_star_container';
    starContainer.setAttribute('role', 'radiogroup');
    if (label) starContainer.setAttribute('aria-labelledby', `field_${field.field_key}_label`);
    
    const maxStars = field.field_options?.maxnum || 5;
    
    for (let i = 1; i <= maxStars; i++) {
      const starWrapper = document.createElement('label');
      starWrapper.className = 'frm_star_label';
      
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `item_meta[${field.id}]`;
      radio.value = i;
      radio.id = `field_${field.field_key}_${i}`;
      radio.className = 'frm_star_radio';
      radio.setAttribute('aria-label', `${i} star${i > 1 ? 's' : ''}`);
      
      const star = document.createElement('span');
      star.className = 'frm_star';
      star.innerHTML = '★';
      
      starWrapper.appendChild(radio);
      starWrapper.appendChild(star);
      starContainer.appendChild(starWrapper);
    }
    
    if (label) container.appendChild(label);
    container.appendChild(starContainer);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  renderQuizScoreField(field) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = `item_meta[${field.id}]`;
    input.id = `field_${field.field_key}`;
    input.className = 'frm_quiz_score';
    input.value = '0';
    input.setAttribute('data-quiz', 'true');
    return input;
  }

  renderDataField(field) {
    const container = this.createFieldContainer(field);
    const label = this.createFieldLabel(field);
    
    const select = document.createElement('select');
    select.name = `item_meta[${field.id}]`;
    select.id = `field_${field.field_key}`;
    select.className = 'frm_data_select';
    select.disabled = true;
    
    const placeholder = document.createElement('option');
    placeholder.textContent = '-- Loading data --';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);
    
    // Add data attributes for dynamic loading
    select.setAttribute('data-form-id', field.field_options?.form_select || '');
    select.setAttribute('data-field-id', field.field_options?.data_field || '');
    
    if (label) container.appendChild(label);
    container.appendChild(select);
    
    const desc = this.createFieldDescription(field);
    if (desc) container.appendChild(desc);
    
    return container;
  }

  /**
   * Layout Field Renderers
   */
  renderHtmlField(field) {
    const container = document.createElement('div');
    container.id = `frm_field_${field.id}_container`;
    container.className = 'frm_html_container';
    container.innerHTML = field.field_options?.html || field.description || '';
    return container;
  }

  renderDividerField(field) {
    const container = document.createElement('div');
    container.id = `frm_field_${field.id}_container`;
    container.className = 'frm_section_heading';
    
    if (field.name) {
      const heading = document.createElement('h3');
      heading.className = 'frm_pos_top';
      heading.textContent = field.name;
      container.appendChild(heading);
    }
    
    if (field.description) {
      const desc = document.createElement('div');
      desc.className = 'frm_description';
      desc.innerHTML = field.description;
      container.appendChild(desc);
    }
    
    return container;
  }

  renderBreakField(field) {
    const container = document.createElement('div');
    container.id = `frm_field_${field.id}_container`;
    container.className = 'frm_page_break';
    container.setAttribute('data-page', field.field_order);
    
    const pageNum = document.createElement('input');
    pageNum.type = 'hidden';
    pageNum.name = 'frm_page_order_' + field.id;
    pageNum.value = field.field_order;
    container.appendChild(pageNum);
    
    return container;
  }

  renderEndDividerField(field) {
    const container = document.createElement('div');
    container.id = `frm_field_${field.id}_container`;
    container.className = 'frm_end_divider';
    return container;
  }

  renderSummaryField(field) {
    const container = this.createFieldContainer(field);
    
    const summary = document.createElement('div');
    summary.id = `field_${field.field_key}`;
    summary.className = 'frm_summary';
    summary.setAttribute('data-summary', 'true');
    
    const title = document.createElement('h3');
    title.textContent = field.name || 'Summary';
    summary.appendChild(title);
    
    const content = document.createElement('div');
    content.className = 'frm_summary_content';
    content.id = `summary_content_${field.field_key}`;
    summary.appendChild(content);
    
    container.appendChild(summary);
    return container;
  }

  /**
   * Action Field Renderers
   */
  renderSubmitField(field) {
    const wrapper = document.createElement('div');
    wrapper.className = 'frm_submit';
    
    const button = document.createElement('button');
    button.type = 'submit';
    button.className = 'frm_button_submit fm-form-submit';
    button.innerText = field.name || 'Submit';
    
    wrapper.appendChild(button);
    return wrapper;
  }

  /**
   * Unknown Field Fallback
   */
  renderUnknownField(field) {
    const container = this.createFieldContainer(field);
    const notice = document.createElement('div');
    notice.className = 'frm_error';
    notice.textContent = `Unsupported field type: ${field.type}`;
    container.appendChild(notice);
    return container;
  }

  /**
   * Helper Methods
   */
  applyFieldAttributes(element, field) {
    const opts = field.field_options || {};
    
    // Required
    if (field.required === '1') {
      element.required = true;
      element.setAttribute('aria-required', 'true');
    }
    
    // Data attributes
    element.setAttribute('data-key', field.field_key);
    element.setAttribute('data-field-id', field.id);
    
    // Validation messages
    if (opts.blank) element.setAttribute('data-reqmsg', opts.blank);
    if (opts.invalid) element.setAttribute('data-invmsg', opts.invalid);
    
    // Placeholder
    if (opts.placeholder) element.placeholder = opts.placeholder;
    
    // Default value
    if (field.default_value) element.value = field.default_value;
    
    // Read-only
    if (opts.read_only === 1 || opts.read_only === '1') {
      element.readOnly = true;
    }
    
    // Autocomplete
    if (opts.autocomplete) {
      element.autocomplete = opts.autocomplete;
    }
    
    // Max length
    if (opts.max_limit) {
      element.maxLength = opts.max_limit;
    }
    
    // ARIA labels
    element.setAttribute('aria-describedby', `frm_desc_field_${field.field_key}`);
  }

  createTurnstileCaptcha() {
    const wrapper = document.createElement('div');
    wrapper.className = 'frm_form_field';
    
    const captcha = document.createElement('div');
    captcha.className = 'cf-turnstile';
    captcha.dataset.sitekey = '0x4AAAAAAAWYtWRiMaUVODel';
    captcha.dataset.size = 'normal';
    captcha.dataset.theme = 'light';
    
    wrapper.appendChild(captcha);
    return wrapper;
  }

  handleImagePreview(event, previewContainer) {
    previewContainer.innerHTML = '';
    const files = event.target.files;
    
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = document.createElement('img');
          img.src = e.target.result;
          img.className = 'frm_preview_image';
          previewContainer.appendChild(img);
        };
        reader.readAsDataURL(file);
      }
    });
  }

  /**
   * Conditional Logic
   */
  applyConditionalLogic(formEl, fields) {
    const fieldMap = Object.fromEntries(fields.map(f => [f.field_key, f]));
    
    fields.forEach(field => {
      const opts = field.field_options;
      if (!opts || !opts.hide_field?.length) return;

      const targetEl = formEl.querySelector(`#frm_field_${field.id}_container`);
      if (!targetEl) return;

      const evaluate = () => {
        const results = opts.hide_field.map((key, idx) => {
          const operator = opts.hide_field_cond?.[idx] || '==';
          const trigger = formEl.querySelector(`[data-key="${key}"]`);
          const value = trigger?.value ?? '';
          const compare = opts.hide_opt?.[idx] ?? '';
          
          switch (operator) {
            case '!=': return value !== compare;
            case '>': return parseFloat(value) > parseFloat(compare);
            case '<': return parseFloat(value) < parseFloat(compare);
            case '>=': return parseFloat(value) >= parseFloat(compare);
            case '<=': return parseFloat(value) <= parseFloat(compare);
            case 'LIKE': return value.includes(compare);
            case 'not LIKE': return !value.includes(compare);
            default: return value === compare;
          }
        });

        const show = opts.show_hide === 'show'
          ? (opts.any_all === 'any' ? results.some(Boolean) : results.every(Boolean))
          : !(opts.any_all === 'any' ? results.some(Boolean) : results.every(Boolean));

        targetEl.style.display = show ? '' : 'none';
        
        // Update required status
        const inputs = targetEl.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
          if (show) {
            if (targetEl.classList.contains('frm_required_field')) {
              input.required = true;
            }
          } else {
            input.required = false;
          }
        });
      };

      // Attach listeners
      opts.hide_field.forEach(key => {
        const trigger = formEl.querySelector(`[data-key="${key}"]`);
        if (trigger) {
          trigger.addEventListener('input', evaluate);
          trigger.addEventListener('change', evaluate);
        }
      });

      // Initial evaluation
      evaluate();
    });
  }

  /**
   * Validation
   */
  validateForm(formEl) {
    let isValid = true;
    const errors = [];

    // Clear previous errors
    formEl.querySelectorAll('.frm_error_msg').forEach(el => el.remove());
    formEl.querySelectorAll('.frm_error').forEach(el => el.classList.remove('frm_error'));

    // Validate required fields
    formEl.querySelectorAll('[required]').forEach(field => {
      // Skip hidden fields
      if (field.closest('[style*="display: none"]')) return;
      
      const value = field.value.trim();
      if (!value) {
        isValid = false;
        const container = field.closest('.frm_form_field');
        container?.classList.add('frm_error');
        
        const errorMsg = document.createElement('div');
        errorMsg.className = 'frm_error_msg';
        errorMsg.textContent = field.getAttribute('data-reqmsg') || 'This field is required';
        field.parentNode.insertBefore(errorMsg, field.nextSibling);
      }
    });

    // Validate email fields
    formEl.querySelectorAll('input[type="email"]').forEach(field => {
      const value = field.value.trim();
      if (value && !this.isValidEmail(value)) {
        isValid = false;
        const container = field.closest('.frm_form_field');
        container?.classList.add('frm_error');
        
        const errorMsg = document.createElement('div');
        errorMsg.className = 'frm_error_msg';
        errorMsg.textContent = field.getAttribute('data-invmsg') || 'Please enter a valid email address';
        field.parentNode.insertBefore(errorMsg, field.nextSibling);
      }
    });

    // Validate URL fields
    formEl.querySelectorAll('input[type="url"]').forEach(field => {
      const value = field.value.trim();
      if (value && !this.isValidUrl(value)) {
        isValid = false;
        const container = field.closest('.frm_form_field');
        container?.classList.add('frm_error');
        
        const errorMsg = document.createElement('div');
        errorMsg.className = 'frm_error_msg';
        errorMsg.textContent = field.getAttribute('data-invmsg') || 'Please enter a valid URL';
        field.parentNode.insertBefore(errorMsg, field.nextSibling);
      }
    });

    return isValid;
  }

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Form Submission
   */
  attachSubmitHandler(form, formData, settings) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Validate
      if (!this.validateForm(form)) {
        this.scrollToFirstError(form);
        return;
      }

      // Check honeypot (if exists)
      const honeypot = form.querySelector('input[name*="honeypot"]');
      if (honeypot?.value.trim() !== '') {
        console.warn('Honeypot triggered');
        return;
      }

      // Prepare form data
      const data = new FormData(form);
      
      // Add nonce if available
      if (settings.nonce) {
        data.append('_wpnonce', settings.nonce);
      }

      // Submit button state
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn?.textContent;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
      }

      try {
        const response = await fetch(`${settings.apiBase}/frm/v2/forms/${formData.id}/entries`, {
          method: 'POST',
          headers: settings.nonce ? { 'X-WP-Nonce': settings.nonce } : {},
          body: data,
          credentials: 'same-origin'
        });

        if (!response.ok) {
          throw new Error(`Submission failed: ${response.status}`);
        }

        const result = await response.json();
        
        // Handle success
        this.handleSubmitSuccess(form, formData, result);
        
        // Trigger custom event
        form.dispatchEvent(new CustomEvent('formidable:success', { 
          detail: { formData, result } 
        }));

        // Optional: Forward to integrations
        if (settings.forwardToActiveCampaign) {
          this.forwardToActiveCampaign(result, settings);
        }

      } catch (error) {
        console.error('Form submission error:', error);
        this.handleSubmitError(form, error);
        
        // Trigger error event
        form.dispatchEvent(new CustomEvent('formidable:error', { 
          detail: { error } 
        }));
        
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });
  }

  handleSubmitSuccess(form, formData, result) {
    const options = formData.options || {};
    
    if (options.success_action === 'message') {
      // Show success message
      const messageDiv = document.createElement('div');
      messageDiv.className = 'frm_message';
      messageDiv.innerHTML = options.success_msg || 'Your responses were successfully submitted. Thank you!';
      form.parentNode.insertBefore(messageDiv, form);
      form.style.display = 'none';
      
    } else if (options.success_action === 'redirect') {
      // Redirect to URL
      if (options.success_url) {
        window.location.href = options.success_url;
      }
      
    } else if (options.success_action === 'page') {
      // Redirect to page
      if (options.success_page_id) {
        window.location.href = `/?p=${options.success_page_id}`;
      }
    }
    
    // Reset form if not redirecting
    if (options.success_action === 'message') {
      setTimeout(() => {
        form.reset();
        form.style.display = '';
        messageDiv?.remove();
      }, 5000);
    }
  }

  handleSubmitError(form, error) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'frm_error_style';
    errorDiv.innerHTML = `
      <div class="frm_error">
        There was a problem submitting your form. Please try again.
        ${error.message ? `<br><small>${error.message}</small>` : ''}
      </div>
    `;
    form.parentNode.insertBefore(errorDiv, form);
    
    setTimeout(() => errorDiv.remove(), 5000);
  }

  scrollToFirstError(form) {
    const firstError = form.querySelector('.frm_error');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  async forwardToActiveCampaign(data, settings) {
    try {
      const payload = {
        email: data.email || '',
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        tags: data.tags || []
      };

      await fetch(`${settings.apiBase}/formidable/v1/activecampaign/forward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin'
      });
    } catch (error) {
      console.warn('ActiveCampaign forwarding failed:', error);
    }
  }

  /**
   * Initialize Special Fields
   */
  initializeSpecialFields(form, fields) {
    // Initialize date pickers
    this.initializeDatePickers(form);
    
    // Initialize rich text editors
    this.initializeRichTextEditors(form);
    
    // Initialize data fields
    this.initializeDataFields(form);
    
    // Initialize summary fields
    this.initializeSummaryFields(form, fields);
    
    // Load Turnstile if captcha present
    if (form.querySelector('.cf-turnstile')) {
      this.loadTurnstile();
    }
  }

  initializeDatePickers(form) {
    // Placeholder for date picker initialization
    // Could integrate with libraries like Flatpickr
  }

  initializeRichTextEditors(form) {
    // Placeholder for RTE initialization
    // Could integrate with libraries like TinyMCE or Quill
  }

  async initializeDataFields(form) {
    const dataFields = form.querySelectorAll('.frm_data_select');
    
    for (const field of dataFields) {
      const formId = field.getAttribute('data-form-id');
      const fieldId = field.getAttribute('data-field-id');
      
      if (formId && fieldId) {
        try {
          // Fetch data from the related form
          const response = await fetch(`/wp-json/frm/v2/forms/${formId}/entries`);
          if (response.ok) {
            const entries = await response.json();
            
            // Clear loading message
            field.innerHTML = '';
            
            // Add blank option
            const blank = document.createElement('option');
            blank.value = '';
            blank.textContent = '-- Select --';
            field.appendChild(blank);
            
            // Add entries as options
            entries.forEach(entry => {
              const option = document.createElement('option');
              option.value = entry.id;
              option.textContent = entry.meta?.[fieldId] || `Entry ${entry.id}`;
              field.appendChild(option);
            });
            
            field.disabled = false;
          }
        } catch (error) {
          console.error('Failed to load data field:', error);
        }
      }
    }
  }

  initializeSummaryFields(form, fields) {
    const summaryFields = form.querySelectorAll('[data-summary="true"]');
    
    summaryFields.forEach(summary => {
      const updateSummary = () => {
        const content = summary.querySelector('.frm_summary_content');
        if (!content) return;
        
        content.innerHTML = '';
        
        fields.forEach(field => {
          if (['hidden', 'captcha', 'submit', 'html', 'divider', 'break', 'end_divider', 'summary'].includes(field.type)) {
            return;
          }
          
          const input = form.querySelector(`[name^="item_meta[${field.id}]"]`);
          if (input && input.value) {
            const row = document.createElement('div');
            row.className = 'frm_summary_row';
            row.innerHTML = `
              <span class="frm_summary_label">${field.name}:</span>
              <span class="frm_summary_value">${input.value}</span>
            `;
            content.appendChild(row);
          }
        });
      };
      
      // Update on any input change
      form.addEventListener('input', updateSummary);
      form.addEventListener('change', updateSummary);
      
      // Initial update
      updateSummary();
    });
  }

  loadTurnstile() {
    if (!document.querySelector('script[src*="turnstile"]')) {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormidableFormRendererEngine;
} else if (typeof define === 'function' && define.amd) {
  define([], () => FormidableFormRendererEngine);
} else {
  window.FormidableFormRendererEngine = FormidableFormRendererEngine;
}

// Convenience function for backward compatibility
window.FormidableFormRendererEngine = async function(config) {
  const engine = new FormidableFormRendererEngine();
  return await engine.render(config);
};