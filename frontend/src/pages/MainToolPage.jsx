function MainToolPage({ username, onLogout }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <h1 className="text-lg font-semibold">BulkPosting</h1>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span>{username}</span>
          <button
            onClick={onLogout}
            className="rounded-lg border border-slate-700 px-3 py-1 hover:bg-slate-800"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="p-6 text-slate-400">Load management tools coming soon.</main>
    </div>
  );
}

export default MainToolPage;
