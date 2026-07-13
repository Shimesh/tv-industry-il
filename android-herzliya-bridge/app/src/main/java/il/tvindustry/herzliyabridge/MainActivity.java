package il.tvindustry.herzliyabridge;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private static final String DEFAULT_INGEST_URL = "https://tv-industry-il.vercel.app/api/admin/calendar-phone-bridge/ingest";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private EditText urlInput;
    private EditText tokenInput;
    private EditText ingestInput;
    private TextView statusText;
    private ProgressBar progressBar;
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        readIntent();
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(18, 10, 39));

        ScrollView controlsScroll = new ScrollView(this);
        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.VERTICAL);
        controls.setPadding(22, 18, 22, 18);
        controlsScroll.addView(controls);

        TextView title = new TextView(this);
        title.setText("חילוץ יומן הרצליה");
        title.setTextColor(Color.WHITE);
        title.setTextSize(22);
        title.setGravity(Gravity.RIGHT);
        controls.addView(title);

        urlInput = input("קישור יומן מלא או אישי");
        tokenInput = input("Bridge token");
        ingestInput = input("Ingest URL");
        ingestInput.setText(DEFAULT_INGEST_URL);
        controls.addView(urlInput);
        controls.addView(tokenInput);
        controls.addView(ingestInput);

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);

        Button loadButton = button("פתח יומן");
        loadButton.setOnClickListener(v -> loadCalendar());
        buttons.addView(loadButton, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));

        Button scrapeButton = button("שאב ושמור");
        scrapeButton.setOnClickListener(v -> injectScraper());
        buttons.addView(scrapeButton, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        controls.addView(buttons);

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        controls.addView(progressBar);

        statusText = new TextView(this);
        statusText.setTextColor(Color.rgb(220, 210, 255));
        statusText.setTextSize(14);
        statusText.setGravity(Gravity.RIGHT);
        statusText.setText("מוכן.");
        controls.addView(statusText);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                setStatus("העמוד נטען. לחץ “שאב ושמור”.", 10);
            }
        });
        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");

        root.addView(controlsScroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));
        root.addView(webView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1
        ));
        setContentView(root);
    }

    private EditText input(String hint) {
        EditText editText = new EditText(this);
        editText.setHint(hint);
        editText.setSingleLine(false);
        editText.setMinLines(1);
        editText.setTextColor(Color.WHITE);
        editText.setHintTextColor(Color.rgb(170, 160, 200));
        editText.setTextDirection(View.TEXT_DIRECTION_LTR);
        editText.setBackgroundColor(Color.rgb(38, 27, 72));
        editText.setPadding(12, 8, 12, 8);
        return editText;
    }

    private Button button(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        return button;
    }

    private void readIntent() {
        Uri data = getIntent() != null ? getIntent().getData() : null;
        if (data == null) return;
        String url = data.getQueryParameter("url");
        String token = data.getQueryParameter("token");
        String ingestUrl = data.getQueryParameter("ingestUrl");
        if (url != null) urlInput.setText(url);
        if (token != null) tokenInput.setText(token);
        if (ingestUrl != null) ingestInput.setText(ingestUrl);
        if (url != null && token != null) loadCalendar();
    }

    private void loadCalendar() {
        String fullUrl = deriveFullDepartmentUrl(urlInput.getText().toString().trim());
        if (fullUrl.isEmpty()) {
            setStatus("לא הצלחתי לזהות GUID ותאריך מהקישור.", 0);
            return;
        }
        urlInput.setText(fullUrl);
        setStatus("פותח יומן מלא...", 5);
        webView.loadUrl(fullUrl);
    }

    private String deriveFullDepartmentUrl(String input) {
        Matcher sendwa = Pattern.compile("[?&]A=([^,\\s&]+),(\\d{8})", Pattern.CASE_INSENSITIVE).matcher(input);
        Matcher direct = Pattern.compile("arguments=-N([^,\\s&]+),-A(\\d{8})(?:,-A(?:true|false))?", Pattern.CASE_INSENSITIVE).matcher(input);
        String guid = null;
        String date = null;
        if (direct.find()) {
            guid = direct.group(1);
            date = direct.group(2);
        } else if (sendwa.find()) {
            guid = sendwa.group(1);
            date = sendwa.group(2);
        }
        if (guid == null || date == null) return "";
        return "https://hsil.acc.co.il:5443/magicscripts/mgrqispi.dll?appname=HSiLWeb&prgname=ShowEmp6&arguments=-N"
                + guid + ",-A" + date + ",-Atrue";
    }

    private void injectScraper() {
        String token = tokenInput.getText().toString().trim();
        String ingestUrl = ingestInput.getText().toString().trim();
        if (token.isEmpty() || ingestUrl.isEmpty()) {
            setStatus("חסר token או ingest URL.", 0);
            return;
        }
        setStatus("מזריק סקרייפר לעמוד...", 12);
        webView.evaluateJavascript(buildScraperScript(token, ingestUrl), null);
    }

    private String buildScraperScript(String token, String ingestUrl) {
        return "(async function(){"
                + "const token=" + jsString(token) + ";"
                + "const ingestUrl=" + jsString(ingestUrl) + ";"
                + "const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));"
                + "const report=(m,p)=>{try{AndroidBridge.status(String(m),Number(p)||0)}catch(e){}};"
                + "const modalSel='#myModal .modal-body';"
                + "async function popup(id){"
                + " const el=[...document.querySelectorAll('[onclick*=\\\"openmd2(\\\"]')].find(e=>(String(e.getAttribute('onclick')||'').match(/openmd2\\((\\d+)\\)/)||[])[1]===String(id));"
                + " const modal=()=>document.querySelector(modalSel);"
                + " const clear=()=>{const m=modal(); if(m)m.innerHTML='';};"
                + " clear();"
                + " if(el){el.scrollIntoView({block:'center',inline:'center'}); el.click();}"
                + " else if(typeof window.openmd2==='function'){window.openmd2(Number(id));}"
                + " else {throw new Error('openmd2 not available for '+id);}"
                + " for(let i=0;i<60;i++){"
                + "   await sleep(250);"
                + "   const m=modal(); const html=m?m.innerHTML:''; const text=m?(m.textContent||''):'';"
                + "   if(html.length>100 && /<table/i.test(html) && /(נייד|טלפון|phone|mobile)/i.test(text)){"
                + "     try{ if(window.jQuery) window.jQuery('#myModal').modal('hide'); }catch(e){}"
                + "     return '<div class=\"modal-body\">'+html+'</div>';"
                + "   }"
                + " }"
                + " throw new Error('popup timeout '+id);"
                + "}"
                + "try{"
                + " if(!/hsil\\.acc\\.co\\.il$/i.test(location.hostname)) throw new Error('לא נמצא בדף הרצליה');"
                + " const ids=[...new Set([...document.querySelectorAll('[onclick*=\\\"openmd2(\\\"]')].map(e=>(String(e.getAttribute('onclick')||'').match(/openmd2\\((\\d+)\\)/)||[])[1]).filter(Boolean).filter(id=>id!=='0'))];"
                + " if(!ids.length) throw new Error('לא נמצאו הפקות openmd2');"
                + " report('נמצאו '+ids.length+' הפקות',20);"
                + " const popupHtmlById={};"
                + " for(let i=0;i<ids.length;i++){const id=ids[i]; report('פותח פופאפ '+(i+1)+'/'+ids.length+' ('+id+')',20+Math.round((i/ids.length)*55)); popupHtmlById[id]=await popup(id);}"
                + " report('שולח לאפליקציה לשמירה...',82);"
                + " const payload={token:token,href:location.href,scheduleHtml:document.documentElement.outerHTML,popupHtmlById:popupHtmlById};"
                + " AndroidBridge.submit(JSON.stringify({ingestUrl:ingestUrl,payload:payload,count:ids.length}));"
                + "}catch(e){AndroidBridge.error(String(e&&e.message?e.message:e));}"
                + "})();";
    }

    private String jsString(String value) {
        return "\"" + value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "") + "\"";
    }

    private void setStatus(String message, int progress) {
        mainHandler.post(() -> {
            statusText.setText(message);
            progressBar.setProgress(Math.max(0, Math.min(100, progress)));
        });
    }

    public class Bridge {
        @JavascriptInterface
        public void status(String message, int progress) {
            setStatus(message, progress);
        }

        @JavascriptInterface
        public void error(String message) {
            setStatus("שגיאה: " + message, 100);
        }

        @JavascriptInterface
        public void submit(String json) {
            setStatus("שולח נתונים לשרת...", 88);
            new Thread(() -> postPayload(json)).start();
        }
    }

    private void postPayload(String wrappedJson) {
        try {
            String ingestUrl = extractJsonString(wrappedJson, "ingestUrl");
            String payload = extractPayloadObject(wrappedJson);
            if (ingestUrl.isEmpty() || payload.isEmpty()) throw new IllegalArgumentException("payload חסר");

            HttpURLConnection connection = (HttpURLConnection) new URL(ingestUrl).openConnection();
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(120000);
            connection.setRequestProperty("Content-Type", "text/plain;charset=utf-8");
            byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(bytes);
            }
            int code = connection.getResponseCode();
            if (code >= 200 && code < 300) {
                setStatus("הושלם. הנתונים נשלחו ונשמרו.", 100);
            } else {
                setStatus("השרת דחה את השמירה. HTTP " + code, 100);
            }
        } catch (Exception error) {
            setStatus("שגיאת שליחה: " + error.getMessage(), 100);
        }
    }

    private String extractJsonString(String json, String key) {
        Matcher matcher = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*\"((?:\\\\.|[^\"])*)\"").matcher(json);
        if (!matcher.find()) return "";
        return matcher.group(1)
                .replace("\\\"", "\"")
                .replace("\\\\", "\\");
    }

    private String extractPayloadObject(String json) {
        String marker = "\"payload\":";
        int start = json.indexOf(marker);
        if (start < 0) return "";
        start = json.indexOf('{', start + marker.length());
        if (start < 0) return "";
        int depth = 0;
        boolean inString = false;
        boolean escaped = false;
        for (int i = start; i < json.length(); i++) {
            char c = json.charAt(i);
            if (escaped) {
                escaped = false;
                continue;
            }
            if (c == '\\') {
                escaped = true;
                continue;
            }
            if (c == '"') {
                inString = !inString;
                continue;
            }
            if (!inString) {
                if (c == '{') depth++;
                if (c == '}') {
                    depth--;
                    if (depth == 0) return json.substring(start, i + 1);
                }
            }
        }
        return "";
    }
}
