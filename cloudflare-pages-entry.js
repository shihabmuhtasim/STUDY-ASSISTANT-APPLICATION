import app from './app.js';

const nextAssetPrefix = '/assets/_next/static/';
const pagesAssetPrefix = '/assets/static/';

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);

    if (url.pathname.startsWith(nextAssetPrefix)) {
      url.pathname = `${pagesAssetPrefix}${url.pathname.slice(nextAssetPrefix.length)}`;
      return env.ASSETS.fetch(new Request(url, request));
    }

    return app.fetch(request, env, context);
  },
};
