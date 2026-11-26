package tui

import (
	"testing"

	"github.com/yetone/magpie/internal/catalog"
	"github.com/yetone/magpie/internal/provider"
)

func TestProviderPickerEditsBestInFamily(t *testing.T) {
	home(t)
	const chat = "http://127.0.0.1:1/v1"
	p := provider.Provider{ID: "relay", Name: "Relay", Key: "k", Chat: chat, BestInFamily: true}
	if err := provider.Save(p); err != nil {
		t.Fatal(err)
	}
	if err := catalog.SaveLive(p.ID, chat, []catalog.Model{{ID: "gemini-3.5-pro"}, {ID: "gemini-2.5-pro"}}); err != nil {
		t.Fatal(err)
	}
	m := model{provs: []provider.Provider{p}, w: 120, h: 40}
	m.openProviderModels(p.ID)
	m = press(t, m, "enter")
	q, err := provider.Find(p.ID)
	if err != nil || !q.BestInFamily || len(q.Exposed()) != 0 {
		t.Fatalf("exclude left %v, %v", q, err)
	}
	m = typeIn(m, "gemini-3.5-pro")
	press(t, m, "ctrl+e")
	q, err = provider.Find(p.ID)
	if err != nil || len(q.Exposed()) != 1 || q.Exposed()[0].ID != "gemini-3.5-pro" {
		t.Fatalf("restore left %v, %v", q, err)
	}
}
