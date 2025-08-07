import React from 'react';

function ContactFormWrapper() {
  const { loading, error, formId, metadata, fields } = useFormidableHydration('contact_form');

  if (loading) return <p>Loading form...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div className="headless-form">
      <h2>{metadata.name}</h2>
      {/* TODO: Map and render fields */}
      <pre>{JSON.stringify(fields, null, 2)}</pre>
    </div>
  );
}

export default ContactFormWrapper;