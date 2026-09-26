#!/usr/bin/env python3
"""
Collecte les perturbations en temps réel du réseau Île-de-France Mobilités
via l'API PRIM (https://prim.iledefrance-mobilites.fr/) et les historise
dans data/incidents.json sans créer de doublons.

Variable d'environnement requise : IDFM_API_KEY
(clé gratuite à générer sur https://prim.iledefrance-mobilites.fr/ après
inscription -> "Espace développeur" -> s'abonner à l'API "line_reports"
(navitia) de la rubrique "Disponibilité en temps réel des données").

Ce script est conçu pour être exécuté périodiquement par une GitHub Action
(voir .github/workflows/collect-incidents.yml), qui committe ensuite le
fichier data/incidents.json mis à jour dans le dépôt.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API_URL = (
    "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/"
    "line_reports/line_reports?count=1000"
)

ROOT = Path(__file__).resolve().parent.parent
INCIDENTS_FILE = ROOT / "data" / "incidents.json"

# Correspondance entre le libellé renvoyé par l'API pour "physical_modes"
# et les catégories utilisées côté front (menu principal).
MODE_MAP = {
    "Métro": "metro",
    "Metro": "metro",
    "RER": "rer",
    "Train": "transilien",
    "TrainTrain": "transilien",
    "LocalTrain": "transilien",
    "Tramway": "tram",
    "Tram": "tram",
    "Bus": "bus",
    "Autobus": "bus",
    "Car": "bus",
}


def fetch_line_reports(api_key: str) -> dict:
    req = urllib.request.Request(API_URL, headers={"apikey": api_key, "accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        print(f"Erreur HTTP {e.code} lors de l'appel à l'API PRIM : {e.read().decode(errors='ignore')}", file=sys.stderr)
        raise
    except urllib.error.URLError as e:
        print(f"Erreur réseau lors de l'appel à l'API PRIM : {e}", file=sys.stderr)
        raise


def normalize_mode(physical_modes) -> str:
    for pm in physical_modes or []:
        name = pm.get("name") or pm.get("id", "")
        if name in MODE_MAP:
            return MODE_MAP[name]
    return "autre"


def load_history() -> dict:
    if INCIDENTS_FILE.exists():
        with open(INCIDENTS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"last_updated": None, "incidents": {}}


def save_history(history: dict) -> None:
    INCIDENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(INCIDENTS_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")


def main() -> int:
    api_key = os.environ.get("IDFM_API_KEY")
    if not api_key:
        print("IDFM_API_KEY manquante dans l'environnement.", file=sys.stderr)
        return 1

    payload = fetch_line_reports(api_key)

    # La réponse Navitia renvoie deux listes à croiser :
    # - "disruptions" : le détail de chaque perturbation (id, cause, sévérité, période...)
    # - "line_reports" : pour chaque ligne, les identifiants de perturbations qui la concernent
    disruptions_by_id = {d["id"]: d for d in payload.get("disruptions", [])}
    line_reports = payload.get("line_reports", [])

    history = load_history()
    now_iso = datetime.now(timezone.utc).isoformat()

    seen_this_run = set()

    for report in line_reports:
        line = report.get("line") or {}
        line_code = line.get("code") or line.get("name") or "?"
        line_name = line.get("name") or line_code
        mode = normalize_mode(line.get("physical_modes"))

        disruption_ids = [d.get("id") for d in report.get("pt_objects", [])] or []
        # Certaines versions de l'API listent les ids directement sur le rapport
        disruption_ids += report.get("disruption_ids", []) or []

        for dis_id in set(disruption_ids):
            disruption = disruptions_by_id.get(dis_id)
            if not disruption:
                continue

            key = f"{line_code}__{dis_id}"
            seen_this_run.add(key)

            cause = disruption.get("cause") or "Cause non précisée"
            severity = (disruption.get("severity") or {}).get("name", "Information")
            messages = disruption.get("messages") or []
            title = ""
            for m in messages:
                text = (m.get("text") or "").strip()
                if text:
                    title = text[:200]
                    break

            application_periods = disruption.get("application_periods") or []
            period_start = application_periods[0].get("begin") if application_periods else None
            period_end = application_periods[0].get("end") if application_periods else None

            existing = history["incidents"].get(key)
            if existing:
                existing["last_seen"] = now_iso
                existing["status"] = disruption.get("status", existing.get("status"))
                existing["period_end"] = period_end
            else:
                history["incidents"][key] = {
                    "disruption_id": dis_id,
                    "line_code": line_code,
                    "line_name": line_name,
                    "mode": mode,
                    "cause": cause,
                    "severity": severity,
                    "title": title,
                    "status": disruption.get("status", "unknown"),
                    "first_seen": now_iso,
                    "last_seen": now_iso,
                    "period_start": period_start,
                    "period_end": period_end,
                }

    history["last_updated"] = now_iso
    save_history(history)

    print(f"OK. {len(seen_this_run)} perturbations actives vues, {len(history['incidents'])} au total dans l'historique.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
