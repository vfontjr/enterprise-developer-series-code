<?php
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