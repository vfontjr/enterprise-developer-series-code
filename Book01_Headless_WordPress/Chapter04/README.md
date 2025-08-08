# Formidable Form Renderer Engine

An enterprise-grade rendering utility for building client-side, reusable Formidable Forms in headless WordPress applications.

## ✅ Purpose

This renderer engine enables developers to build fully client-rendered Formidable Forms from REST API data. It supports:

- Form hydration from form key
- Field rendering (text, textarea, email, checkbox, hidden, submit)
- Conditional logic
- Validation
- Honeypot anti-spam
- CAPTCHA (Cloudflare Turnstile)
- ActiveCampaign forwarding integration
- Reusability across multiple headless applications

## 📦 Installation

Include the script in your headless frontend project:

```html
<script src="/js/formidable-form-renderer-engine.js"></script>
```

Or if using a bundler:

```js
import { FormidableFormRendererEngine } from './formidable-form-renderer-engine.js';
```

## 🧠 Assumptions

This engine assumes the following WordPress-side APIs are available:

### 1. Custom REST endpoint to resolve form key to ID

```php
add_action('rest_api_init', function() {
  register_rest_route('custom/v1', '/form-id/(?P<key>[a-zA-Z0-9_-]+)', [
    'methods' => 'GET',
    'callback' => function($request) {
      $key = sanitize_text_field($request['key']);
      $id = FrmForm::get_id_by_key($key);
      return is_numeric($id)
        ? ['id' => $id]
        : new WP_Error('not_found', 'Form not found', ['status' => 404]);
    },
    'permission_callback' => '__return_true'
  ]);
});
```

### 2. Standard Formidable REST API endpoints

- `/wp-json/frm/v2/forms/{id}`
- `/wp-json/frm/v2/forms/{id}/fields`
- `/wp-json/frm/v2/forms/{id}/entries`

### 3. ActiveCampaign Forwarding Endpoint (Optional)

```php
register_rest_route('formidable/v1', '/activecampaign/forward', [
  'methods' => 'POST',
  'callback' => 'your_custom_forwarding_callback',
  'permission_callback' => '__return_true'
]);
```

## 🔧 Usage

```js
FormidableFormRendererEngine({
  formKey: 'contact-form',
  mountSelector: '#app',
  enableCaptcha: true
});
```

### Multiple Forms

```js
['contact-form', 'signup-form', 'support-request'].forEach(key => {
  FormidableFormRendererEngine({
    formKey: key,
    mountSelector: `#form-${key}`
  });
});
```

## 🚀 Execution Flow

1. Lookup form ID via `/custom/v1/form-id/{form_key}`
2. Get form metadata: `/frm/v2/forms/{id}`
3. Get form fields: `/frm/v2/forms/{id}/fields`
4. Render form dynamically
5. Bind logic, validation, and integrations

## 🧪 Testing

### Success

- Fields render with logic
- Validation works
- Submit POSTs to Formidable endpoint
- Optional AC forwarding works

### Errors

- 404: Invalid form key route
- No REST response: Check WP REST API
- Honeypot blocks: Bots fail silently

## 📚 Reference

Font, Victor M. *The Art and Soul of Software Portability: Designing Reusable Components with WordPress and Formidable Forms*. Masterminds Enterprise Developer Series, 2025. https://www.amazon.com/dp/B0CS11F7Y4

🔗 https://github.com/vfontjr/enterprise-developer-series-code