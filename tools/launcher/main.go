// CEJ-PAGE launcher.
//
// The editor is a static site that needs two things a double-clicked
// index.html cannot give it: a real origin (the File System Access API,
// which is how the editor writes to disk, refuses to run on file://) and
// working ES module resolution. So this serves the site from 127.0.0.1 and
// opens the default browser at it.
//
// The whole site is compiled into the binary, so what ships is one file:
// no installer, no admin rights, no folder to keep next to it, and -- since
// every dependency is vendored -- no network.
package main

import (
	"embed"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os/exec"
	"runtime"
	"time"
)

//go:embed all:site
var embedded embed.FS

// Arbitrary high port, unlikely to collide with anything a workstation runs.
const basePort = 8731

func main() {
	site, err := fs.Sub(embedded, "site")
	if err != nil {
		fatal("não foi possível ler os arquivos embutidos: %v", err)
	}

	listener, port := listen()
	if listener == nil {
		fatal("não foi possível abrir uma porta local (%d-%d).\n"+
			"   Talvez o CEJ-PAGE já esteja em execução em outra janela.", basePort, basePort+19)
	}
	defer listener.Close()

	url := fmt.Sprintf("http://127.0.0.1:%d/", port)

	fmt.Println()
	fmt.Println("   CEJ-PAGE está em execução.")
	fmt.Println()
	fmt.Println("   O editor foi aberto no seu navegador. Se não abrir sozinho,")
	fmt.Printf("   digite este endereço na barra do navegador: %s\n", url)
	fmt.Println()
	fmt.Println("   >> Para encerrar, feche esta janela. <<")
	fmt.Println()

	// Give the listener a moment to be accepting before the browser asks.
	go func() {
		time.Sleep(300 * time.Millisecond)
		openBrowser(url)
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/__fetch", fetchRemote)
	mux.Handle("/", http.FileServer(http.FS(site)))
	server := &http.Server{Handler: noCache(mux)}
	if err := server.Serve(listener); err != nil {
		fatal("o servidor local parou: %v", err)
	}
}

// fetchRemote is intentionally available only through this loopback server.
// It lets the desktop executable import pages whose servers do not opt into
// browser CORS, without exposing a public proxy service.
func fetchRemote(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	target, err := url.Parse(r.URL.Query().Get("url"))
	if err != nil || target.Host == "" || (target.Scheme != "http" && target.Scheme != "https") {
		http.Error(w, "invalid remote URL", http.StatusBadRequest)
		return
	}

	client := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, _ []*http.Request) error {
			if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
				return fmt.Errorf("unsupported redirect scheme")
			}
			return nil
		},
	}
	resp, err := client.Get(target.String())
	if err != nil {
		http.Error(w, "remote fetch failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	} else {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	}
	w.WriteHeader(resp.StatusCode)
	// HTML documents are small in this workflow; cap the response so this
	// endpoint cannot be used to consume unbounded memory or disk via a browser.
	const maxImportSize = 16 << 20
	_, _ = io.CopyN(w, resp.Body, maxImportSize)
}

// Bind to loopback only — this must never be reachable from the network.
// Walk a small range so a second copy, or a leftover process, doesn't make
// the program unusable.
func listen() (net.Listener, int) {
	for port := basePort; port < basePort+20; port++ {
		l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
		if err == nil {
			return l, port
		}
	}
	return nil, 0
}

// The editor is rebuilt into the binary on every release, so a browser
// holding a cached copy of an older build would be confusing and hard to
// diagnose for someone who can't open devtools.
func noCache(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		h.ServeHTTP(w, r)
	})
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		// rundll32 avoids `cmd /c start`, which flashes a second console
		// window and mangles URLs containing '&'.
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		fmt.Printf("   (não foi possível abrir o navegador automaticamente: %v)\n", err)
	}
}

// Keep the console window up on failure: it is closed by the user, so an
// error that scrolled past and exited would leave them with nothing to read.
func fatal(format string, args ...any) {
	fmt.Println()
	fmt.Printf("   ERRO: "+format+"\n", args...)
	fmt.Println()
	fmt.Println("   Feche esta janela.")
	select {}
}
