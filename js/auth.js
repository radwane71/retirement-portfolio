async function requireAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  return session.user;
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}
