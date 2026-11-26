package gui

// Best in family (Steven on Discord): the editor's fourth option is saved
// as bestInFamily with no model picked, kept by a save that doesn't name
// it, and the card serves the newest of each family; each model says
// whether it is one (best), so the editor draws them before a save.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/yetone/magpie/internal/catalog"
	"github.com/yetone/magpie/internal/provider"
)

func TestProviderSaveBestInFamily(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("USERPROFILE", os.Getenv("HOME"))
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	t.Setenv("XDG_CACHE_HOME", t.TempDir())
	mux := http.NewServeMux()
	providerRoutes(mux, nil)
	post := func(body string) {
		t.Helper()
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("POST", "/api/provider/save", strings.NewReader(body)))
		if w.Code != 200 {
			t.Fatalf("%d %s", w.Code, w.Body)
		}
	}
	type model struct {
		ID   string `json:"id"`
		On   bool   `json:"on"`
		Best bool   `json:"best"`
	}
	card := func() (best bool, on, newest []string) {
		t.Helper()
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("GET", "/api/providers", nil))
		var got struct {
			Providers []struct {
				ID           string  `json:"id"`
				BestInFamily bool    `json:"bestInFamily"`
				Models       []model `json:"models"`
			} `json:"providers"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
			t.Fatal(err)
		}
		for _, p := range got.Providers {
			if p.ID != "relay" {
				continue
			}
			for _, m := range p.Models {
				if m.On {
					on = append(on, m.ID)
				}
				if m.Best {
					newest = append(newest, m.ID)
				}
			}
			return p.BestInFamily, on, newest
		}
		t.Fatal("relay not listed")
		return
	}

	const chat = "http://127.0.0.1:1/v1"
	post(`{"id":"relay","name":"Relay","key":"sk-r","chat":"` + chat + `","new":true}`)
	ms := []catalog.Model{{ID: "gemini-3.5-flash"}, {ID: "gemini-2.5-flash"}, {ID: "gemini-3.1-pro-preview"}, {ID: "gemini-2.5-pro"}, {ID: "gemini-3.5-flash-lite"}}
	if err := catalog.SaveLive("relay", chat, ms); err != nil {
		t.Fatal(err)
	}
	newestWant := []string{"gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3.5-flash-lite"}
	if best, on, newest := card(); best || len(on) != 5 || !slices.Equal(newest, newestWant) {
		t.Fatalf("before: best %v on %v newest %v", best, on, newest)
	}

	post(`{"id":"relay","from":"relay","name":"Relay","key":"","chat":"` + chat + `","models":[],"noModels":false,"bestInFamily":true,"headers":{}}`)
	if best, on, _ := card(); !best || !slices.Equal(on, newestWant) {
		t.Fatalf("best: %v on %v", best, on)
	}

	// a save that doesn't name it (another editor's, the CLI's) keeps it
	post(`{"id":"relay","from":"relay","name":"Relay","key":"","chat":"` + chat + `","headers":{}}`)
	if best, on, _ := card(); !best || !slices.Equal(on, newestWant) {
		t.Errorf("not named: best %v on %v", best, on)
	}

	// Vendor's list: the editor sends it false
	post(`{"id":"relay","from":"relay","name":"Relay","key":"","chat":"` + chat + `","models":[],"noModels":false,"bestInFamily":false,"headers":{}}`)
	if best, on, _ := card(); best || len(on) != 5 {
		t.Errorf("vendor's list: best %v on %v", best, on)
	}

	// a pick clears it, even sent with it
	post(`{"id":"relay","from":"relay","name":"Relay","key":"","chat":"` + chat + `","models":["gemini-2.5-pro"],"noModels":false,"bestInFamily":true,"headers":{}}`)
	if p, _ := provider.Find("relay"); p.BestInFamily {
		t.Error("a pick kept Best in family")
	}
	if best, on, _ := card(); best || !slices.Equal(on, []string{"gemini-2.5-pro"}) {
		t.Errorf("picked: best %v on %v", best, on)
	}
}

func TestProviderBestInFamilySettingsAndPreview(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("USERPROFILE", os.Getenv("HOME"))
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	t.Setenv("XDG_CACHE_HOME", t.TempDir())
	mux := http.NewServeMux()
	providerRoutes(mux, nil)
	post := func(path, body string, want int) []byte {
		t.Helper()
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("POST", "/api/provider/"+path, strings.NewReader(body)))
		if w.Code != want {
			t.Fatalf("%s: %d %s", path, w.Code, w.Body)
		}
		return w.Body.Bytes()
	}
	const chat = "http://127.0.0.1:1/v1"
	const urls = `"chat":"` + chat + `","responses":"` + chat + `"`
	const saved = `{"from":"relay","id":"relay","name":"Relay",` + urls
	post("save", `{"id":"relay","name":"Relay","key":"k",`+urls+`,"new":true}`, 200)
	ms := []catalog.Model{{ID: "gemini-3.5-pro", APIs: []string{"anthropic"}}, {ID: "gemini-2.5-pro"}}
	if err := catalog.SaveLive("relay", chat, ms); err != nil {
		t.Fatal(err)
	}
	if err := provider.SetModelAPI("relay/gemini-3.5-pro", "chat"); err != nil {
		t.Fatal(err)
	}
	var preview struct{ Models []string }
	raw := post("models", `{"id":"relay","bestInFamilyPreview":true,"bestInFamilyLimit":48,"bestInFamilyOverrides":{"gemini-3.5-pro":0,"gemini-2.5-pro":1}}`, 200)
	if err := json.Unmarshal(raw, &preview); err != nil || !slices.Equal(preview.Models, []string{"gemini-2.5-pro"}) {
		t.Fatalf("preview %s, %v", raw, err)
	}
	if p, _ := provider.Find("relay"); p.BestInFamily || len(p.Exposed()) != 2 {
		t.Fatalf("preview changed the saved provider: %v %v", p.BestInFamily, p.Exposed())
	}
	post("save", saved+`,"bestInFamily":true,"bestInFamilyLimit":48,"bestInFamilyOverrides":{"gemini-3.5-pro":0,"gemini-2.5-pro":1}}`, 200)
	post("save", saved+`}`, 200)
	post("save", saved+`,"bestInFamilyLimit":96,"bestInFamilyOverrides":{"gemini-3.5-pro":2}}`, 400)
	if p, _ := provider.Find("relay"); p.BestModelLimit() != 48 || len(p.Exposed()) != 1 || p.Exposed()[0].ID != "gemini-2.5-pro" {
		t.Fatalf("save lost an override or the limit: %v, %v", p.BestModelLimit(), p.Exposed())
	}
	t.Run("preview stages a model's automatic API", func(t *testing.T) {
		raw := post("models", `{"id":"relay","bestInFamilyPreview":true,"bestInFamilyOverrides":{},"modelPrefs":{"gemini-3.5-pro":{"api":""}}}`, 200)
		var got struct{ Models []string }
		if err := json.Unmarshal(raw, &got); err != nil || !slices.Equal(got.Models, []string{"gemini-2.5-pro"}) {
			t.Fatalf("preview %s, %v", raw, err)
		}
		if p, _ := provider.Find("relay"); p.NoAPIFor("gemini-3.5-pro") {
			t.Fatal("preview changed the saved API")
		}
	})
	t.Run("copy keeps settings", func(t *testing.T) {
		post("save", `{"id":"relay-copy","name":"Relay copy","copyOf":"relay",`+urls+`,"new":true}`, 200)
		p, err := provider.Find("relay-copy")
		if err != nil || !p.BestInFamily || p.BestModelLimit() != 48 || len(p.BestInFamilyOverrides) != 2 || p.BestInFamilyOverrides["gemini-3.5-pro"] != 0 || p.BestInFamilyOverrides["gemini-2.5-pro"] != 1 {
			t.Fatal("copy lost the source's Best in family settings")
		}
	})
	post("save", saved+`,"bestInFamilyLimit":null,"bestInFamilyOverrides":{}}`, 200)
	if p, _ := provider.Find("relay"); p.BestModelLimit() != 24 || len(p.Exposed()) != 1 || p.Exposed()[0].ID != "gemini-3.5-pro" {
		t.Fatalf("reset left %v, %v", p.BestModelLimit(), p.Exposed())
	}
}
