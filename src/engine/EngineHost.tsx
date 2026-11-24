import React, { useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView as RawWebView } from 'react-native-webview';
import { STOCKFISH_SRC } from './stockfishSource';
import { ENGINE_LANES } from './engineLanes';

/** How EngineProvider talks to Stockfish: send UCI commands to an engine (lane); messages come back as JSON strings. */
export type EngineHostHandle = { send: (cmd: string, lane?: number) => void; reload: () => void };
export type EngineHostProps = {
  ref: React.Ref<EngineHostHandle>;
  /** `{t:'boot', n}` once `n` engines are running, `{t:'line', l, w}` per line of engine `w`, `{t:'err', m}` on errors. */
  onMessage: (data: string) => void;
  /** The engine's process died (it's restarted with `reload`). */
  onCrash: () => void;
};

type WebViewHandle = { injectJavaScript: (js: string) => void; reload: () => void };
// The package's bundled typings don't line up with React 19's ref types, so describe what we use.
const WebView = RawWebView as unknown as React.ComponentType<{
  ref?: React.Ref<WebViewHandle>;
  source: { html: string; baseUrl?: string };
  originWhitelist?: string[];
  javaScriptEnabled?: boolean;
  onMessage?: (e: { nativeEvent: { data: string } }) => void;
  onContentProcessDidTerminate?: () => void;
  onRenderProcessGone?: () => void;
}>;

const BRIDGE = `
(function () {
  function post(o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  var src = document.getElementById('sf').textContent;
  var workers = [];
  try {
    var url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
    for (var i = 0; i < ${ENGINE_LANES}; i++) {
      (function (k) {
        var w = new Worker(url);
        w.onmessage = function (e) { post({ t: 'line', l: String(e.data), w: k }); };
        w.onerror = function (e) { post({ t: 'err', m: String(e && e.message), w: k }); };
        workers.push(w);
      })(i);
    }
  } catch (err) {}
  if (workers.length) {
    window.__sf = function (cmd, k) { (workers[k] || workers[0]).postMessage(cmd); };
    post({ t: 'boot', n: workers.length });
  } else {
    // No worker support: run one engine on the WebView's main thread instead.
    (0, eval)(src);
    var sf = STOCKFISH();
    sf.onmessage = function (l) { post({ t: 'line', l: String(l), w: 0 }); };
    window.__sf = function (cmd) { setTimeout(function () { sf.postMessage(cmd, true); }, 0); };
    post({ t: 'boot', n: 1 });
  }
})();
true;
`;

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<script id="sf" type="text/plain">${STOCKFISH_SRC}</script>
<script>${BRIDGE}</script>
</body></html>`;

/** Phones: Stockfish runs in a Web Worker inside a hidden WebView. */
export function EngineHost({ ref, onMessage, onCrash }: EngineHostProps) {
  const web = useRef<WebViewHandle>(null);
  useImperativeHandle(ref, () => ({
    send: (cmd, lane = 0) => web.current?.injectJavaScript(`window.__sf && window.__sf(${JSON.stringify(cmd)}, ${lane});true;`),
    reload: () => web.current?.reload(),
  }));
  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={web}
        source={{ html: HTML, baseUrl: 'https://localhost/' }}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={(e) => onMessage(e.nativeEvent.data)}
        onContentProcessDidTerminate={onCrash}
        onRenderProcessGone={onCrash}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10 },
});
