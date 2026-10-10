import './globals.css';
import Nav from './nav';

export const metadata = { title: 'LinkedIn Studio', description: 'Daily system design posts + recruiter outreach' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="brand"><span className="logo">in</span> Studio</div>
          <Nav />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
