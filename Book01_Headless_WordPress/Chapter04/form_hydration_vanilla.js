/** Example usage:
hydrateForm('contact_form');
 *
 * @author Headless WordPress, Formidable Power, 2nd ed.
 * @license MIT
 *
 * Fetch the form ID by key using the custom REST route
 * @param {string} formKey - The key of the Formidable form
 * @returns {Promise<number>} The form ID
 */
async function fetchFormIdByKey(formKey) {
  const response = await fetch(`/wp-json/custom/v1/form-id/${formKey}`);
  if (!response.ok) {
    throw new Error(`Form key "${formKey}" not found.`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Fetch form metadata using the Formidable Forms REST API
 * @param {number} formId - The numeric form ID
 * @returns {Promise<object>} The full form object
 */
async function fetchFormMetadata(formId) {
  const response = await fetch(`/wp-json/frm/v2/forms/${formId}`);
  if (!response.ok) {
    throw new Error(`Failed to retrieve form metadata for ID ${formId}`);
  }

  return response.json();
}

/**
 * Fetch form fields for the given form ID
 * @param {number} formId - The numeric form ID
 * @returns {Promise<Array>} An array of field objects
 */
async function fetchFormFields(formId) {
  const response = await fetch(`/wp-json/frm/v2/forms/${formId}/fields`);
  if (!response.ok) {
    throw new Error(`Failed to retrieve fields for form ID ${formId}`);
  }

  return response.json();
}

/**
 * Hydrate a form by key: fetch ID, metadata, and fields
 * @param {string} formKey
 * @returns {Promise<object>} { id, metadata, fields }
 */
async function hydrateForm(formKey) {
  try {
    const formId = await fetchFormIdByKey(formKey);
    const metadata = await fetchFormMetadata(formId);
    const fields = await fetchFormFields(formId);

    console.log('Hydrated Form:', { id: formId, metadata, fields });
    return { id: formId, metadata, fields };
  } catch (error) {
    console.error('Hydration failed:', error);
    return null;
  }
}