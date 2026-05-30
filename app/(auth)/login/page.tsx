import { signIn } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h2 className="text-2xl font-bold">Cognilit</h2>
      <h1 className="text-xl font-semibold">Entrar</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form action={signIn} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          E-mail
          <input name="email" type="email" required className="border p-2" />
        </label>
        <label className="flex flex-col gap-1">
          Senha
          <input
            name="password"
            type="password"
            required
            className="border p-2"
          />
        </label>
        <button type="submit" className="bg-black p-2 text-white">
          Entrar
        </button>
      </form>
      <a href="/signup" className="text-sm underline">
        Criar conta
      </a>
    </main>
  );
}
