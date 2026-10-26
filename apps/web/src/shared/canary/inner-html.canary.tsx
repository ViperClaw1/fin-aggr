// expect: no-restricted-syntax XSS
export const C = () => <div dangerouslySetInnerHTML={{ __html: '' }} />;
