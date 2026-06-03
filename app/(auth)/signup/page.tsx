import { signUp } from "../actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <p className="eyebrow">Cadastro</p>
      <h1 className="title-serif">Criar conta</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={signUp} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-ink-soft">
          E-mail
          <input name="email" type="email" required className="control" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink-soft">
          Senha
          <input name="password" type="password" required className="control" />
        </label>
        <button type="submit" className="btn-primary w-full">
          Criar conta
        </button>
      </form>
      <a href="/login" className="text-sm underline text-ink-soft">
        Já tenho conta
      </a>
    </main>
  );
}
