import useSettings from '../../hooks/useSettings';

const PORTFOLIO_URL = 'https://jhossain.vercel.app/';

/**
 * The one line at the foot of the shell: whose system this is, and who built it.
 *
 * Deliberately a single hairline-separated strip rather than a column of links.
 * This is a working application people spend a shift inside, not a marketing
 * site — every row of footer navigation is vertical space taken from the record
 * someone is reading, and the rail already holds everywhere they can go.
 *
 * The hospital name comes from settings rather than a constant, so a renamed
 * deployment renames its own copyright without a code change. The year is read
 * at render, which is the only way it stays correct after New Year.
 */
export default function Footer() {
  const { hospitalName } = useSettings();

  return (
    <footer
      // Hidden on paper: an invoice or a discharge summary should not carry a
      // build credit, and the shell already strips its chrome for printing.
      className="border-t border-line print:hidden"
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-col items-center gap-1.5 px-4 py-4 text-center sm:flex-row sm:justify-between sm:gap-4 sm:px-6 sm:text-left lg:px-8">
        <p className="text-xs text-slate-500">
          © {new Date().getFullYear()} {hospitalName}. All rights reserved.
        </p>

        <p className="text-xs text-slate-500">
          Built by{' '}
          <a
            href={PORTFOLIO_URL}
            target="_blank"
            // `noreferrer` alongside `noopener`: the new tab gets no window
            // handle back into this one, and no referrer naming an internal
            // hospital host.
            rel="noopener noreferrer"
            className="rounded font-semibold text-brand-700 underline decoration-brand-300 decoration-1 underline-offset-2 transition-colors duration-200 hover:text-brand-800 hover:decoration-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Jubair Hossain
          </a>
        </p>
      </div>
    </footer>
  );
}
