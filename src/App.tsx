import { buttonVariants } from "@/components/ui/button-variants";

function App() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen space-y-20">
      <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">
        Vite, React, Shadcn-ui minimal starter
      </h1>
      <div className="space-y-4">
        <p className="text-red-500 font-bold">Red bold text</p>
        <p className="text-blue-600 font-semibold">Blue semibold text</p>
        <p className="text-green-700 underline">Green underlined text</p>
        <p className="text-purple-800 italic">Purple italic text</p>
        <p className="text-yellow-600 font-black text-xl">
          Large yellow black text
        </p>
      </div>
      <a
        href="https://github.com/moinulmoin/vite-react-tailwind-starter"
        target="_blank"
        rel="noreferrer"
        className={buttonVariants()}
      >
        ⭐️ on GitHub
      </a>
    </main>
  );
}

export default App;
