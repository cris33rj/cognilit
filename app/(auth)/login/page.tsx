import { signIn } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <p className="eyebrow">Acesso</p>
      <h2 className="title-serif">Cognilit</h2>
      <h1 className="text-xl font-semibold text-ink">Entrar</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={signIn} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-ink-soft">
          E-mail
          <input name="email" type="email" required className="control" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink-soft">
          Senha
          <input name="password" type="password" required className="control" />
        </label>
        <button type="submit" className="btn-primary w-full">
          Entrar
        </button>
      </form>
      <a href="/signup" className="text-sm underline text-ink-soft">
        Criar conta
      </a>
    </main>
  );
}
