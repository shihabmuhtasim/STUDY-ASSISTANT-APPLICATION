import App from '../src/App';
import { getChatGPTUser } from './chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getChatGPTUser();

  return (
    <App
      initialAccount={user ? {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
      } : null}
    />
  );
}
