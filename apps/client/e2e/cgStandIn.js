// A stand-in for CrazyGames' SDK v3 (window.CrazyGames.SDK), shipped only in the crazygames build's e2e zip
// (vite.config.ts `hostedPage`, embedHost.ts `CG_STAND_IN`), so e2e/embed.spec.ts never loads the real SDK.
//
// Its start state comes from the frame's query: cgUser=<name> (signed in), cgInstant=1 (isInstantMultiplayer),
// cgInvite=<code> (inviteParams { room }), cgMute=1 (settings.muteAudio), cgInit=fail|hang|absent (init rejects,
// never settles, or there is no SDK at all). Every call is recorded in window.__cg.calls ({ name, args }); the test
// fires the listeners with __cg.join({ room }), __cg.settings({ muteAudio }) and __cg.login(user).
(function () {
  var q = new URLSearchParams(location.search);
  var initMode = q.get('cgInit');
  if (initMode === 'absent') return;
  var calls = [];
  var rec = function (name, args) {
    calls.push({ name: name, args: args || [] });
  };
  var settings = { muteAudio: q.get('cgMute') === '1', disableChat: false };
  var user = q.get('cgUser') ? { username: q.get('cgUser'), profilePictureUrl: 'https://example.invalid/p.png' } : null;
  var invite = q.get('cgInvite') ? { room: q.get('cgInvite') } : null;
  var listeners = { settings: [], join: [], auth: [] };
  var inited = false;
  var need = function (name) {
    if (!inited) throw { code: 'sdkNotInitialized', message: name + ' called before init' };
  };
  var remove = function (list, l) {
    var i = list.indexOf(l);
    if (i >= 0) list.splice(i, 1);
  };
  var call = function (name, fn) {
    return function () {
      var args = Array.prototype.slice.call(arguments);
      rec(name, args);
      need(name);
      return fn ? fn.apply(null, args) : undefined;
    };
  };
  var game = {
    loadingStart: call('loadingStart'),
    loadingStop: call('loadingStop'),
    gameplayStart: call('gameplayStart'),
    gameplayStop: call('gameplayStop'),
    happytime: call('happytime'),
    updateRoom: call('updateRoom'),
    leftRoom: call('leftRoom'),
    inviteLink: call('inviteLink', function (params) {
      return 'https://www.crazygames.com/game/tower-defense-together?room=' + encodeURIComponent((params && params.room) || '');
    }),
    getInviteParam: call('getInviteParam', function (name) {
      return invite && name in invite ? invite[name] : null;
    }),
    addSettingsChangeListener: call('addSettingsChangeListener', function (l) {
      listeners.settings.push(l);
    }),
    removeSettingsChangeListener: call('removeSettingsChangeListener', function (l) {
      remove(listeners.settings, l);
    }),
    addJoinRoomListener: call('addJoinRoomListener', function (l) {
      listeners.join.push(l);
    }),
    removeJoinRoomListener: call('removeJoinRoomListener', function (l) {
      remove(listeners.join, l);
    }),
  };
  Object.defineProperty(game, 'settings', { get: function () { return { muteAudio: settings.muteAudio, disableChat: settings.disableChat }; } });
  Object.defineProperty(game, 'isInstantMultiplayer', { get: function () { return q.get('cgInstant') === '1'; } });
  Object.defineProperty(game, 'inviteParams', { get: function () { return invite; } });
  var userModule = {
    getUser: call('getUser', function () {
      return Promise.resolve(user);
    }),
    addAuthListener: call('addAuthListener', function (l) {
      listeners.auth.push(l);
    }),
    removeAuthListener: call('removeAuthListener', function (l) {
      remove(listeners.auth, l);
    }),
  };
  Object.defineProperty(userModule, 'isUserAccountAvailable', { get: function () { return true; } });
  window.CrazyGames = {
    SDK: {
      environment: 'crazygames',
      init: function () {
        rec('init', []);
        if (initMode === 'fail') return Promise.reject({ code: 'stand_in', message: 'init failed (stand-in)' });
        if (initMode === 'hang') return new Promise(function () {});
        inited = true;
        return Promise.resolve();
      },
      game: game,
      user: userModule,
    },
  };
  window.__cg = {
    calls: calls,
    join: function (params) {
      listeners.join.slice().forEach(function (l) { l(params); });
    },
    settings: function (next) {
      for (var k in next) settings[k] = next[k];
      var copy = { muteAudio: settings.muteAudio, disableChat: settings.disableChat };
      listeners.settings.slice().forEach(function (l) { l(copy); });
    },
    login: function (next) {
      user = next;
      listeners.auth.slice().forEach(function (l) { l(next); });
    },
  };
})();
