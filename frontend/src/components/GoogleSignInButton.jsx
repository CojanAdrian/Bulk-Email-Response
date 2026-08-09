import { GoogleIcon } from './icons';
import { getGoogleSignInUrl } from '../api/auth';

function GoogleSignInButton({ label = 'Continue with Google' }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = getGoogleSignInUrl();
      }}
      className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-text transition hover:bg-surface-alt"
    >
      <GoogleIcon className="h-4 w-4" />
      {label}
    </button>
  );
}

export default GoogleSignInButton;
