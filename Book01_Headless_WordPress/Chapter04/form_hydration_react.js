import { useState, useEffect } from 'react';

/**
 * Custom hook to hydrate a Formidable Form using its form key.
 * @param {string} formKey - The unique form key
 * @returns {object} { loading, error, formId, metadata, fields }
 */
function useFormidableHydration(formKey) {
  const [formId, setFormId] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [fields, setFields] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!formKey) return;

    const fetchFormIdByKey = async (key) => {
      const response = await fetch(`/wp-json/custom/v1/form-id/${key}`);
      if (!response.ok) {
        throw new Error(`Form ID not found for key: ${key}`);
      }
      const data = await response.json();
      return data.id;
    };

    const fetchFormMetadata = async (id) => {
      const response = await fetch(`/wp-json/frm/v2/forms/${id}`);
      if (!response.ok) {
        throw new Error(`Form metadata failed for ID: ${id}`);
      }
      return await response.json();
    };

    const fetchFormFields = async (id) => {
      const response = await fetch(`/wp-json/frm/v2/forms/${id}/fields`);
      if (!response.ok) {
        throw new Error(`Form fields failed for ID: ${id}`);
      }
      return await response.json();
    };

    const hydrate = async () => {
      try {
        const id = await fetchFormIdByKey(formKey);
        setFormId(id);

        const [meta, fieldList] = await Promise.all([
          fetchFormMetadata(id),
          fetchFormFields(id),
        ]);

        setMetadata(meta);
        setFields(fieldList);
      } catch (err) {
        console.error('Hydration error:', err);
        setError(err.message || 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    hydrate();
  }, [formKey]);

  return { loading, error, formId, metadata, fields };
}