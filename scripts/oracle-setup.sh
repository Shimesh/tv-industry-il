#!/bin/bash
# Setup script for Oracle VM scraper
# Run once on the VM: bash oracle-setup.sh

set -e

echo "=== Installing Node.js 20 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "=== Installing dependencies ==="
npm install -g firebase-admin cheerio

echo "=== Creating scraper directory ==="
mkdir -p ~/ratings-scraper
cd ~/ratings-scraper

echo "=== Done. Next steps ==="
echo "1. Copy scripts/scrape-ratings-oracle.mjs to ~/ratings-scraper/"
echo "2. Create ~/ratings-scraper/.env with Firebase credentials"
echo "3. Run: crontab -e and add the cron line"
