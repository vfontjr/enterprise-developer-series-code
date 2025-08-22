<?php
/* Formidable's honeypot fields are rendered at run time.
 * they are "virtual fields" created for a specific purpose and not
 * saved to the database. Reverse engineering Formidable's FrmHoneypot class
 * reveals the honeypot field always use the (max_field_id + 1 as the field id */
$frm_settings = FrmAppHelper::get_settings();
$has_honeypot = ($frm_settings->honeypot === 1) ? true : false;
if ( $has_honeypot ) {
    /* this code is lifted from the maybe_render_field() method in
     * /formidable/classes/models/FrmHoneypot.php
     */
    $max_field_id = FrmDb::get_var(
        'frm_fields',
        array(),
        'id',
        array(
            'order_by' => 'id DESC',
        )
    );
    global $frm_vars;
    $offset = isset( $frm_vars['honeypot_selectors'] ) ? count( $frm_vars['honeypot_selectors'] ) + 1 : 1;
    $honeypot_field_id = $max_field_id ? $max_field_id + $offset : $offset;
}
?>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Victor Font Consulting Group, LLC | Get "The Alien Gospel"</title>
<link rel="stylesheet" id="formidable-css" href="https://victorfont.com/wp-content/plugins/formidable/css/formidableforms.css?ver=8201742" media="all">
<link rel="stylesheet" id="wp-jquery-ui-dialog-css" href="https://victorfont.com/wp-includes/css/jquery-ui-dialog.min.css?ver=0f1ec753e0e3dfebf43485bbdd91676a" media="all">

<script src="https://victorfont.com/wp-includes/js/jquery/jquery.min.js?ver=3.7.1" id="jquery-core-js"></script>

<?php
FrmHoneypot::maybe_print_honeypot_css();
if ( $has_honeypot ) {
echo "<!-- Formidable's honeypot field -->
<style>#frm_field_{$honeypot_field_id}_container {visibility:hidden;overflow:hidden;width:0;height:0;position:absolute;}</style>";
}
?>
<style>
    body {
        background: black;
    }

    .with_frm_style form {
        padding: 2rem;
    }
    .frm_button_submit.frm_final_submit {
        background: linear-gradient(135deg, #00d4ff, #0099cc);
        color: white;
        padding: 1rem 2rem;
        text-decoration: none;
        border-radius: 50px;
        font-weight: bold;
        transition: all 0.3s ease;
        width: 100%;
    }

    .frm_button_submit.frm_final_submit:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 30px rgba(0, 212, 255, 0.4);
    }

    .with_frm_style .frm_primary_label,
    .frm_style_formidable-style-2.with_frm_style div.frm_description,
    .with_frm_style .frm_checkbox label:not(.frm-label-disabled) {
        color: #fff;
    }

    .with_frm_style .frm_required,
    .frm_style_formidable-style-2.with_frm_style .frm_error {
        color: red;
    }

    .frm_forms.frm_style_formidable-style-2.with_frm_style {
        display: flex;
        align-items: center;
        height: 100vh;
        justify-content: center;
    }

    .with_frm_style .frm_message {
        font-size: 1.25rem;
        margin: 0 2rem;
    }
</style>
</head>