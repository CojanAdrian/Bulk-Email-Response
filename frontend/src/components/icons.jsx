export function BoxIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  );
}

export function MailIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export function LogoutIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function GoogleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="#4285F4"
        d="M23.64 12.204c0-.815-.073-1.6-.21-2.353H12v4.451h6.523c-.281 1.5-1.135 2.771-2.42 3.622v3.012h3.917c2.293-2.11 3.62-5.216 3.62-8.732z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.956-1.075 7.941-2.906l-3.917-3.012c-1.086.729-2.475 1.16-4.024 1.16-3.093 0-5.712-2.089-6.646-4.897H1.309v3.093C3.284 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC04"
        d="M5.354 14.345C5.115 13.616 4.98 12.837 4.98 12s.135-1.616.374-2.345V6.562H1.309C.474 8.24 0 10.062 0 12s.474 3.76 1.309 5.438l4.045-3.093z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.764 0 3.348.605 4.593 1.799l3.443-3.443C17.951 1.19 15.236 0 12 0 7.31 0 3.284 2.7 1.309 6.562l4.045 3.093C6.288 6.847 8.907 4.75 12 4.75z"
      />
    </svg>
  );
}
