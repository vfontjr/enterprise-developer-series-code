<?php
/**
 * Template Name: Form
 */
 get_header("custom");
?>
<script id="formidable-js-extra">
var frm_js = {"ajax_url":"https:\/\/victorfont.com\/wp-admin\/admin-ajax.php","images_url":"https:\/\/victorfont.com\/wp-content\/plugins\/formidable\/images","loading":"Loading\u2026","remove":"Remove","offset":"4","nonce":"1eb4f31527","id":"ID","no_results":"No results match","file_spam":"That file looks like Spam.","calc_error":"There is an error in the calculation in the field with key","empty_fields":"Please complete the preceding required fields before uploading a file.","focus_first_error":"1","include_alert_role":"1","include_resend_email":""};
var frm_password_checks = {"eight-char":{"label":"Eight characters minimum","regex":"\/^.{8,}$\/","message":"Passwords require at least 8 characters"},"lowercase":{"label":"One lowercase letter","regex":"#[a-z]+#","message":"Passwords must include at least one lowercase letter"},"uppercase":{"label":"One uppercase letter","regex":"#[A-Z]+#","message":"Passwords must include at least one uppercase letter"},"number":{"label":"One number","regex":"#[0-9]+#","message":"Passwords must include at least one number"},"special-char":{"label":"One special character","regex":"\/(?=.*[^a-zA-Z0-9])\/","message":"Password is invalid"}};
var frmCheckboxI18n = {"errorMsg":{"min_selections":"This field requires a minimum of %1$d selected options but only %2$d were submitted."}};
</script>
<script src="https://victorfont.com/wp-content/plugins/formidable-pro/js/frm.min.js?ver=6.23.1-jquery" id="formidable-js"></script>
<script id="formidable-js-after">
window.frm_js.repeaterRowDeleteConfirmation = "Are you sure you want to delete this row?";
window.frm_js.datepickerLibrary = "default";
</script>
<script defer="defer" async="async" src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=frmTurnstile&amp;render=explicit&amp;ver=3" id="captcha-api-js"></script>

<div id="primary" class="content-area">
     <main id="main" class="site-main">
         <?php
         while ( have_posts() ) :
             the_post();
             the_content();
         endwhile; // End of the loop.
         ?>
     </main><!-- #main -->
 </div><!-- #primary -->

 <?php
 get_footer("custom");
 ?>