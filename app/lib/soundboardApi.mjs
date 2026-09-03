export async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function createSoundboardApi({
  fetchImpl,
  onUnauthorized = () => {},
  onSetupRequired = () => {}
}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetchImpl must be a function');
  }

  const fetchApi = async (url, options = {}) => {
    const response = await fetchImpl(url, options);
    if (response.status === 401) {
      onUnauthorized();
      throw new Error('Unauthorized');
    }
    if (response.status === 503) {
      const data = await response.clone().json().catch(() => ({}));
      if (data?.setupRequired) {
        onSetupRequired();
        throw new Error('Initial setup required');
      }
    }
    return response;
  };

  const post = (url, body) => fetchApi(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  return {
    fetchApi,
    post,
    playTrack: (fileName, channelId) => post('/api/play-audio', { fileName, channelId }),
    queueTrack: (fileName, channelId) => post('/api/playlist/add', { fileName, channelId }),
    switchChannel: channelId => post('/api/switch-channel', { channelId }),
    setPlaylist: (queue, channelId) => post('/api/playlist/set', { channelId, queue })
  };
}
