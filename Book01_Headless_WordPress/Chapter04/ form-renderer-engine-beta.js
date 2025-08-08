export default async function FormidableFormRendererEngine({
  formKey,
  mountSelector,
  enableCaptcha = false
}) {
  // ─── Data‐fetching helpers ─────────────────────────────────────────────────────
  const getFormIdFromKey = async (key) => {
    const res = await fetch(`/wp-json/custom/v1/form-id/${key}`)
    if (!res.ok) throw new Error('Form ID not found')
    return (await res.json()).id
  }

  const getFormMetadata = async (id) => {
    const res = await fetch(`/wp-json/frm/v2/forms/${id}`)
    if (!res.ok) throw new Error('Form metadata not found')
    return await res.json()
  }

  const getFormFields = async (id) => {
    const res = await fetch(`/wp-json/frm/v2/forms/${id}/fields`)
    if (!res.ok) throw new Error('Form fields not found')
    return await res.json()
  }

  // ─── DOM‐utility functions ────────────────────────────────────────────────────
  function createContainer(field, metaId) {
    const div = document.createElement('div')
    div.id = `frm_field_${metaId}_container`
    div.className = `frm_form_field form-field ${field.field_options?.classes || ''}`
    return div
  }

  function createLabel(field, metaId) {
    const label = document.createElement('label')
    label.htmlFor = `field_${field.field_key}`
    label.id = `field_${field.field_key}_label`
    label.className = 'frm_primary_label'
    label.innerHTML = `${field.name || ''}${field.required ? '<span class="frm_required">*</span>' : ''}`
    return label
  }

  // ─── Core field‐builder ─────────────────────────────────────────────────────────
  function buildField(field) {
    const container = createContainer(field, field.id)
    let label, input

    // Attach label for most types
    if (!['hidden', 'captcha', 'submit'].includes(field.type)) {
      label = createLabel(field, field.id)
      container.append(label)
    }

    switch (field.type) {
      case 'text':
      case 'email':
        input = document.createElement('input')
        input.type = field.type
        break

      case 'textarea':
        input = document.createElement('textarea')
        input.rows = field.field_options.max || 5
        break

      case 'checkbox':
      case 'radio':
        input = document.createElement('div')
        input.className = 'frm_opt_container'
        input.setAttribute('role', field.type === 'checkbox' ? 'group' : 'radiogroup')
        field.options.forEach((opt, i) => {
          const wrap = document.createElement('div')
          wrap.className = field.type === 'checkbox' ? 'frm_checkbox' : 'frm_radio'
          const ctrl = document.createElement('input')
          ctrl.type = field.type
          ctrl.name = field.type === 'checkbox'
            ? `item_meta[${field.id}][]`
            : `item_meta[${field.id}]`
          ctrl.id = `field_${field.field_key}-${i}`
          ctrl.value = opt.value ?? opt
          const optLabel = document.createElement('label')
          optLabel.htmlFor = ctrl.id
          optLabel.textContent = opt.label ?? opt
          wrap.append(ctrl, optLabel)
          input.append(wrap)
        })
        input.setAttribute('aria-labelledby', label.id)
        break

      case 'hidden':
        input = document.createElement('input')
        input.type = 'hidden'
        input.value = field.default_value || ''
        break

      case 'captcha':
        input = document.createElement('div')
        input.className = 'cf-turnstile'
        input.dataset.sitekey = '0x4AAAAAAAWYtWRiMaUVODel'
        input.dataset.size = field.field_options.captcha_size || 'normal'
        input.dataset.theme = field.field_options.captcha_theme || 'light'
        break

      case 'submit':
        const subWrap = document.createElement('div')
        subWrap.className = 'frm_submit'
        const btn = document.createElement('button')
        btn.type = 'submit'
        btn.className = 'frm_button_submit fm-form-submit'
        btn.textContent = field.name || 'Submit'
        subWrap.append(btn)
        return subWrap

      case 'address':
        label = createLabel(field, field.id)
        container.append(label)
        // Street, apt, city, state, zip, country
        ;['line1','line2','city','state','zip','country'].forEach(part => {
          const el = document.createElement('input')
          el.type = 'text'
          el.name = `item_meta[${field.id}][${part}]`
          el.id = `field_${field.field_key}_${part}`
          el.placeholder = part.charAt(0).toUpperCase() + part.slice(1)
          container.append(el)
        })
        break

      case 'number':
        input = document.createElement('input')
        input.type = 'number'
        input.min = field.field_options.minnum || ''
        input.max = field.field_options.maxnum || ''
        input.step = field.field_options.step || '1'
        break

      case 'password':
        input = document.createElement('input')
        input.type = 'password'
        input.placeholder = field.field_options.placeholder || ''
        break

      case 'name':
        ;['first','last'].forEach(part => {
          const el = document.createElement('input')
          el.type = 'text'
          el.name = `item_meta[${field.id}][${part}]`
          el.id = `field_${field.field_key}_${part}`
          el.placeholder = part.charAt(0).toUpperCase() + part.slice(1)
          container.append(el)
        })
        break

      case 'phone':
        input = document.createElement('input')
        input.type = 'tel'
        break

      case 'select':
        input = document.createElement('select')
        if (field.field_options.blank) {
          const blankOpt = document.createElement('option')
          blankOpt.value = ''
          blankOpt.textContent = field.field_options.blank
          input.append(blankOpt)
        }
        field.options.forEach(opt => {
          const o = document.createElement('option')
          o.value = opt.value ?? opt
          o.textContent = opt.label ?? opt
          input.append(o)
        })
        break

      case 'file':
        input = document.createElement('input')
        input.type = 'file'
        if (field.multiple) input.multiple = true
        break

      case 'range':
        input = document.createElement('input')
        input.type = 'range'
        input.min = field.field_options.minnum || 0
        input.max = field.field_options.maxnum || 100
        input.step = field.field_options.step || 1
        input.value = field.default_value || 0
        break

      // Extended types
      case 'data':
        input = document.createElement('select')
        input.disabled = true
        const placeholderOpt = document.createElement('option')
        placeholderOpt.textContent = '-- Data field requires backend population --'
        input.append(placeholderOpt)
        break

      case 'quiz_score':
        input = document.createElement('input')
        input.type = 'hidden'
        input.value = '0'
        break

      case 'star':
        input = document.createElement('div')
        input.className = 'frm_star_container'
        input.setAttribute('role', 'radiogroup')
        for (let i = 1; i <= 5; i++) {
          const lbl = document.createElement('label')
          const rd = document.createElement('input')
          rd.type = 'radio'
          rd.name = `item_meta[${field.id}]`
          rd.value = i
          rd.setAttribute('aria-label', `${i} star${i>1?'s':''}`)
          lbl.append(rd, '★')
          input.append(lbl)
        }
        break

      default:
        return null
    }

    // Common attributes and description
    if (input && !['hidden','submit'].includes(field.type)) {
      input.name = input.name || `item_meta[${field.id}]`
      input.id = input.id || `field_${field.field_key}`
      input.setAttribute('data-key', field.field_key)
      if (field.field_options?.blank)   input.setAttribute('data-reqmsg',   field.field_options.blank)
      if (field.field_options?.invalid) input.setAttribute('data-invmsg',   field.field_options.invalid)
      input.setAttribute('aria-required', field.required ? 'true' : 'false')
      container.append(input)
    }

    if (field.description) {
      const desc = document.createElement('div')
      desc.id = `frm_desc_field_${field.field_key}`
      desc.className = 'frm_description'
      desc.innerHTML = field.description
      container.append(desc)
    }

    return container
  }

  // ─── Conditional logic ─────────────────────────────────────────────────────────
  function applyConditionalLogic(formEl, fields) {
    fields.forEach(f => {
      const opts = f.field_options
      if (!opts?.hide_field?.length) return
      const target = formEl.querySelector(`#frm_field_${f.id}_container`)
      const evaluate = () => {
        const results = opts.hide_field.map((key, i) => {
          const operator = opts.hide_field_cond?.[i] || '=='
          const trg = formEl.querySelector(`[data-key="${key}"]`)
          const val = trg?.value ?? ''
          const comp = opts.hide_opt?.[i] ?? ''
          return operator === '!=' ? val !== comp : val === comp
        })
        const meets = opts.any_all === 'any' ? results.some(Boolean) : results.every(Boolean)
        const show  = opts.show_hide === 'show' ? meets : !meets
        if (target) target.style.display = show ? '' : 'none'
      }
      opts.hide_field.forEach(key => {
        const trg = formEl.querySelector(`[data-key="${key}"]`)
        if (trg) trg.addEventListener('input', evaluate)
      })
      evaluate()
    })
  }

  // ─── Validation on submit ─────────────────────────────────────────────────────
  function validateFormFields(formEl) {
    let valid = true
    formEl.querySelectorAll('[data-reqmsg]').forEach(el => {
      if (!el.value.trim()) {
        el.setAttribute('aria-invalid','true')
        el.classList.add('invalid')
        valid = false
      } else {
        el.setAttribute('aria-invalid','false')
        el.classList.remove('invalid')
      }
    })
    return valid
  }

  // ─── Forward entry to ActiveCampaign ───────────────────────────────────────────
  async function forwardToActiveCampaign(data) {
    const payload = {
      email:      data.email      || '',
      first_name: data.first_name || '',
      last_name:  data.last_name  || ''
    }
    try {
      await fetch('/wp-json/formidable/v1/activecampaign/forward', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify(payload),
        credentials: 'same-origin'
      })
    } catch (err) {
      console.warn('ActiveCampaign forwarding failed:', err)
    }
  }

  // ─── Handle form submission ────────────────────────────────────────────────────
  function handleSubmit(form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      // Honeypot
      const honeypot = form.querySelector('input[name="item_meta[672]"]')
      if (honeypot?.value) return
      if (!validateFormFields(form)) return

      const data = new FormData(form)
      try {
        const res = await fetch(`/wp-json/frm/v2/forms/${data.get('form_id')}/entries`, {
          method:      'POST',
          headers:     { 'X-WP-Nonce': wpApiSettings?.nonce || '' },
          body:        data,
          credentials: 'same-origin'
        })
        if (!res.ok) throw new Error('Submission failed')
        const result = await res.json()
        alert('Form submitted successfully!')
        form.reset()
        await forwardToActiveCampaign(result)
      } catch (err) {
        console.error(err)
        alert('Error submitting form.')
      }
    })
  }

  // ─── Hydration & rendering sequence ────────────────────────────────────────────
  try {
    const formId   = await getFormIdFromKey(formKey)
    const meta     = await getFormMetadata(formId)
    const fields   = Object.values(await getFormFields(formId))
    const mountEl  = document.querySelector(mountSelector)
    if (!mountEl) throw new Error('Mount element not found')

    // Build <form>
    const form = document.createElement('form')
    form.method    = 'post'
    form.className = 'frm-show-form headless-formidable'
    form.id        = `form_${formKey}`

    // Hidden action inputs
    ;['frm_action','form_id','form_key'].forEach(name => {
      const inp = document.createElement('input')
      inp.type  = 'hidden'
      inp.name  = name
      inp.value = name === 'frm_action' ? 'create'
                : name === 'form_id'     ? meta.id
                : formKey
      form.append(inp)
    })

    // Field rendering
    fields.forEach(f => {
      const el = buildField(f)
      if (el) form.append(el)
    })

    // Optional Turnstile
    if (enableCaptcha) {
      const cap = document.createElement('div')
      cap.className = 'cf-turnstile'
      cap.dataset.sitekey = '0x4AAAAAAAWYtWRiMaUVODel'
      cap.dataset.size    = 'normal'
      cap.dataset.theme   = 'light'
      form.append(cap)
    }

    // Mount & wire everything up
    mountEl.innerHTML = ''
    mountEl.append(form)
    applyConditionalLogic(form, fields)
    handleSubmit(form)

  } catch (err) {
    console.error('Formidable hydration error:', err)
  }
}