import LoginForm from './LoginForm';

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="panel">
        <div className="panel-head"><span>OSINT//LENS · ACCESS</span><span className="text-amber-dim">auth required</span></div>
        <div className="p-4">
          {searchParams.error ? <p className="mb-3 text-bad">Sign-in failed. Please try again.</p> : null}
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
