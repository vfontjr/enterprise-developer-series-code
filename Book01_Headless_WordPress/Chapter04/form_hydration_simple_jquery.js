jQuery(document).ready(function ($) {

  /**
   * Fetch the form ID by key using the custom REST route
   * @param {string} formKey - The unique key for the Formidable form
   * @returns {Promise<number>} The resolved form ID
   */
  function fetchFormIdByKey(formKey) {
    return $.ajax({
      url: `/wp-json/custom/v1/form-id/${formKey}`,
      method: 'GET',
      dataType: 'json'
    }).then(function (response) {
      if (response && response.id) {
        return response.id;
      } else {
        return $.Deferred().reject(`Form key "${formKey}" not found.`);
      }
    });
  }

  /**
   * Fetch form metadata from Formidable's REST API
   * @param {number} formId - The numeric ID returned from step 1
   * @returns {Promise<object>} The form metadata object
   */
  function fetchFormMetadata(formId) {
    return $.ajax({
      url: `/wp-json/frm/v2/forms/${formId}`,
      method: 'GET',
      dataType: 'json'
    });
  }

  /**
   * Fetch the form fields for the given form ID
   * @param {number} formId - The numeric form ID
   * @returns {Promise<Array>} Array of field objects
   */
  function fetchFormFields(formId) {
    return $.ajax({
      url: `/wp-json/frm/v2/forms/${formId}/fields`,
      method: 'GET',
      dataType: 'json'
    });
  }

  /**
   * Full hydration workflow: get ID → metadata → fields
   * @param {string} formKey - The form key to hydrate
   * @returns {Promise<object>} { id, metadata, fields }
   */
  function hydrateForm(formKey) {
    return fetchFormIdByKey(formKey)
      .then(function (formId) {
        return $.when(fetchFormMetadata(formId), fetchFormFields(formId))
          .then(function (metadata, fields) {
            return {
              id: formId,
              metadata: metadata[0],
              fields: fields[0]
            };
          });
      })
      .fail(function (error) {
        console.error('Hydration failed:', error);
      });
  }

  // Example usage
  hydrateForm('contact_form').then(function (result) {
    console.log('Hydrated Form:', result);
    // TODO: renderForm(result)
  });

});