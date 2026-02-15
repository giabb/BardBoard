/**
  BardBoard - A DiscordJS bot soundboard
  Copyright (C) 2024 Giovanbattista Abbate

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
const path = require('path');
const rootPackageJson = require(path.join(__dirname, '..', '..', 'package.json'));

const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'BardBoard API',
    version: rootPackageJson.version,
    description: 'HTTP API used by the BardBoard Next.js frontend.'
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'system', description: 'App configuration and service metadata' },
    { name: 'audio', description: 'Playback controls and now-playing state' },
    { name: 'playlist', description: 'Queue management and playback flow' },
    { name: 'files', description: 'Audio library upload/list/delete operations' },
    { name: 'auth', description: 'Session login/logout endpoints' }
  ],
  paths: {
    '/env-config': {
      get: {
        tags: ['system'],
        summary: 'Get runtime frontend config',
        responses: {
          200: {
            description: 'Config payload',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    uploadMaxMb: { type: 'integer', minimum: 1 }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/auth/login': {
      post: {
        tags: ['auth'],
        summary: 'Create authenticated session',
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string' },
                  password: { type: 'string' },
                  remember: { type: 'string', description: 'Set to 1 to enable remember me' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Session authenticated' },
          401: { description: 'Invalid credentials' }
        }
      }
    },
    '/auth/logout': {
      post: {
        tags: ['auth'],
        summary: 'Destroy active session',
        responses: { 200: { description: 'Session destroyed' } }
      }
    },
    '/auth/status': {
      get: {
        tags: ['auth'],
        summary: 'Read auth mode and current session state',
        responses: {
          200: {
            description: 'Auth status payload',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    authEnabled: { type: 'boolean' },
                    authenticated: { type: 'boolean' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/audio-files': {
      get: {
        tags: ['files'],
        summary: 'List audio files grouped by category',
        responses: {
          200: {
            description: 'Audio file map',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AudioFilesResponse' }
              }
            }
          }
        }
      }
    },
    '/upload-audio': {
      post: {
        tags: ['files'],
        summary: 'Upload an audio file',
        parameters: [{
          in: 'query',
          name: 'category',
          schema: { type: 'string' },
          required: false,
          description: 'Optional category folder name'
        }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary' } }
              }
            }
          }
        },
        responses: {
          200: { description: 'Upload completed' },
          400: { description: 'Validation error' }
        }
      }
    },
    '/audio-file': {
      delete: {
        tags: ['files'],
        summary: 'Delete one audio file',
        parameters: [{
          in: 'query',
          name: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Relative path, e.g. Category/Song.mp3'
        }],
        responses: {
          200: { description: 'Deleted' },
          400: { description: 'Invalid path or unsupported type' },
          404: { description: 'File not found' },
          409: { description: 'File is currently in use' },
          500: { description: 'Delete failed' }
        }
      }
    },
    '/voice-channels': {
      get: {
        tags: ['system'],
        summary: 'List voice channels visible to the bot',
        responses: {
          200: {
            description: 'Voice channel list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    channels: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/VoiceChannelOption' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/audio-file/move': {
      post: {
        tags: ['files'],
        summary: 'Move one audio file to another category or root',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['path'],
                properties: {
                  path: { type: 'string', description: 'Relative source path, e.g. Category/Song.mp3' },
                  targetCategory: { type: 'string', description: 'Target category name. Use empty string for root.' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Move completed' },
          400: { description: 'Invalid path/category or unsupported file type' },
          404: { description: 'File or category not found' },
          409: { description: 'File in use or destination conflict' },
          500: { description: 'Move failed' }
        }
      }
    },
    '/audio-category': {
      delete: {
        tags: ['files'],
        summary: 'Delete a whole audio category',
        parameters: [{
          in: 'query',
          name: 'name',
          required: true,
          schema: { type: 'string' },
          description: 'Category name'
        }],
        responses: {
          200: { description: 'Deleted' },
          400: { description: 'Invalid category' },
          404: { description: 'Category not found' },
          409: { description: 'Category contains file(s) currently in use' },
          500: { description: 'Delete failed' }
        }
      }
    },
    '/play-audio': {
      post: {
        tags: ['audio'],
        summary: 'Play an audio file immediately',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/FileChannelRequest' } } }
        },
        responses: {
          200: { description: 'Playback started' },
          400: { description: 'Invalid channelId or fileName' }
        }
      }
    },
    '/toggle-pause': {
      post: {
        tags: ['audio'],
        summary: 'Toggle pause/resume for active playback',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChannelRequest' } } }
        },
        responses: {
          200: { description: 'Pause state' },
          400: { description: 'Invalid channelId' },
          404: { description: 'No active player for channel' }
        }
      }
    },
    '/pause-status': {
      get: {
        tags: ['audio'],
        summary: 'Read pause state',
        parameters: [{ $ref: '#/components/parameters/ChannelIdQuery' }],
        responses: {
          200: { description: 'Pause status' },
          400: { description: 'Invalid channelId' }
        }
      }
    },
    '/stop-audio': {
      post: {
        tags: ['audio'],
        summary: 'Stop active playback',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChannelRequest' } } }
        },
        responses: {
          200: { description: 'Stopped' },
          400: { description: 'Invalid channelId' }
        }
      }
    },
    '/switch-channel': {
      post: {
        tags: ['audio'],
        summary: 'Switch bot voice connection to another channel',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChannelRequest' } } }
        },
        responses: {
          200: { description: 'Switched' },
          400: { description: 'Invalid channelId' },
          404: { description: 'Channel not found' }
        }
      }
    },
    '/toggle-repeat': {
      post: {
        tags: ['audio'],
        summary: 'Toggle repeat for the guild',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChannelRequest' } } }
        },
        responses: {
          200: { description: 'Repeat status' },
          400: { description: 'Invalid channelId' },
          404: { description: 'Channel not found' }
        }
      }
    },
    '/repeat-status': {
      get: {
        tags: ['audio'],
        summary: 'Read repeat status',
        parameters: [{ $ref: '#/components/parameters/ChannelIdQuery' }],
        responses: {
          200: { description: 'Repeat status' },
          400: { description: 'Invalid channelId' }
        }
      }
    },
    '/set-volume': {
      post: {
        tags: ['audio'],
        summary: 'Set volume (0..1)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                allOf: [{ $ref: '#/components/schemas/ChannelRequest' }],
                type: 'object',
                properties: { volume: { type: 'number', minimum: 0, maximum: 1 } },
                required: ['channelId', 'volume']
              }
            }
          }
        },
        responses: {
          200: { description: 'Volume set' },
          400: { description: 'Invalid channelId or volume' }
        }
      }
    },
    '/get-volume': {
      get: {
        tags: ['audio'],
        summary: 'Read current volume',
        parameters: [{ $ref: '#/components/parameters/ChannelIdQuery' }],
        responses: {
          200: { description: 'Volume' },
          400: { description: 'Invalid channelId' }
        }
      }
    },
    '/seek': {
      post: {
        tags: ['audio'],
        summary: 'Seek current playback position',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                allOf: [{ $ref: '#/components/schemas/ChannelRequest' }],
                type: 'object',
                properties: { offsetSecs: { type: 'number', minimum: 0 } },
                required: ['channelId', 'offsetSecs']
              }
            }
          }
        },
        responses: {
          200: { description: 'Seek applied' },
          400: { description: 'Invalid channelId or offsetSecs' },
          404: { description: 'Nothing currently seekable for channel' },
          500: { description: 'Seek failed' }
        }
      }
    },
    '/now-playing': {
      get: {
        tags: ['audio'],
        summary: 'Get current track state',
        parameters: [{ $ref: '#/components/parameters/ChannelIdQuery' }],
        responses: {
          200: {
            description: 'Now playing payload',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/NowPlaying' } } }
          },
          400: { description: 'Invalid channelId' }
        }
      }
    },
    '/playlist': {
      get: {
        tags: ['playlist'],
        summary: 'Get queue',
        parameters: [{ $ref: '#/components/parameters/ChannelIdQuery' }],
        responses: {
          200: { description: 'Queue' },
          400: { description: 'Invalid channelId' },
          404: { description: 'Channel not found' }
        }
      }
    },
    '/playlist/add': {
      post: {
        tags: ['playlist'],
        summary: 'Add track to queue',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/FileChannelRequest' } } }
        },
        responses: {
          200: { description: 'Queue updated' },
          400: { description: 'Invalid channelId or fileName' },
          404: { description: 'Channel not found' }
        }
      }
    },
    '/playlist/set': {
      post: {
        tags: ['playlist'],
        summary: 'Replace queue',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                allOf: [{ $ref: '#/components/schemas/ChannelRequest' }],
                type: 'object',
                properties: { queue: { type: 'array', items: { type: 'string' } } },
                required: ['channelId', 'queue']
              }
            }
          }
        },
        responses: {
          200: { description: 'Queue updated' },
          400: { description: 'Invalid channelId, queue or fileName' },
          404: { description: 'Channel not found' }
        }
      }
    },
    '/playlist/shuffle': {
      post: {
        tags: ['playlist'],
        summary: 'Shuffle queue',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChannelRequest' } } }
        },
        responses: {
          200: { description: 'Queue updated' },
          400: { description: 'Invalid channelId' },
          404: { description: 'Channel not found' }
        }
      }
    },
    '/playlist/clear': {
      post: {
        tags: ['playlist'],
        summary: 'Clear queue',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChannelRequest' } } }
        },
        responses: {
          200: { description: 'Queue cleared' },
          400: { description: 'Invalid channelId' },
          404: { description: 'Channel not found' }
        }
      }
    },
    '/playlist/play': {
      post: {
        tags: ['playlist'],
        summary: 'Start queue playback if idle',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChannelRequest' } } }
        },
        responses: {
          200: { description: 'Playback status' },
          400: { description: 'Invalid channelId' },
          404: { description: 'Queue empty' }
        }
      }
    },
    '/playlist/skip': {
      post: {
        tags: ['playlist'],
        summary: 'Skip to next queue item',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChannelRequest' } } }
        },
        responses: {
          200: { description: 'Playback status' },
          400: { description: 'Invalid channelId' }
        }
      }
    }
  },
  components: {
    parameters: {
      ChannelIdQuery: {
        in: 'query',
        name: 'channelId',
        required: true,
        schema: { type: 'string' },
        description: 'Discord voice channel id'
      }
    },
    schemas: {
      ChannelRequest: {
        type: 'object',
        required: ['channelId'],
        properties: { channelId: { type: 'string' } }
      },
      FileChannelRequest: {
        allOf: [{ $ref: '#/components/schemas/ChannelRequest' }],
        type: 'object',
        required: ['channelId', 'fileName'],
        properties: { fileName: { type: 'string' } }
      },
      AudioFilesResponse: {
        type: 'object',
        properties: {
          root: { type: 'array', items: { type: 'string' } },
          categories: {
            type: 'object',
            additionalProperties: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      VoiceChannelOption: {
        type: 'object',
        properties: {
          guildId: { type: 'string' },
          guildName: { type: 'string' },
          channelId: { type: 'string' },
          channelName: { type: 'string' },
          position: { type: 'integer' }
        }
      },
      NowPlaying: {
        type: 'object',
        properties: {
          song: { type: 'string', nullable: true },
          elapsed: { type: 'number' },
          duration: { type: 'number' },
          paused: { type: 'boolean' }
        }
      }
    }
  }
};

module.exports = openApiSpec;
