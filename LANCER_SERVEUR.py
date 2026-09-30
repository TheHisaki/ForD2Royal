#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import http.server
import socketserver
import socket
import sys
import os

PORT = 8080

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Ajouter les en-têtes CORS pour permettre les connexions
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def log_message(self, format, *args):
        # Afficher les logs de manière plus lisible
        sys.stdout.write("%s - %s\n" % (self.address_string(), format % args))

def get_local_ip():
    """Obtenir l'adresse IP locale"""
    try:
        # Créer une socket pour obtenir l'IP locale
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "127.0.0.1"

def main():
    # Changer le répertoire de travail vers le dossier du jeu
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    # Obtenir l'adresse IP locale
    local_ip = get_local_ip()
    
    # Créer le serveur
    Handler = MyHTTPRequestHandler
    
    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            print("\n" + "="*50)
            print("  FOR2D ROYAL - SERVEUR LOCAL")
            print("="*50 + "\n")
            print("Serveur demarre avec succes!\n")
            print("Acces local (sur cet ordinateur):")
            print(f"   http://localhost:{PORT}")
            print(f"   http://127.0.0.1:{PORT}\n")
            print("Acces reseau local (autres appareils):")
            print(f"   http://{local_ip}:{PORT}\n")
            print("="*50 + "\n")
            print("Instructions pour vos amis:\n")
            print("1. Partagez cette adresse:")
            print(f"   http://{local_ip}:{PORT}")
            print("2. Ils l'ouvrent dans leur navigateur")
            print("3. Creez une partie et donnez-leur le code")
            print("4. Ils rejoignent avec le code\n")
            print("="*50 + "\n")
            print("Appuyez sur Ctrl+C pour arreter le serveur\n")
            
            # Démarrer le serveur
            httpd.serve_forever()
            
    except PermissionError:
        print(f"\nERREUR: Le port {PORT} necessite des droits admin.")
        print("Essayez un autre port en modifiant PORT dans le script.")
        print("Ports recommandes sans admin: 8000, 8080, 8888, 3000\n")
        sys.exit(1)
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"\nERREUR: Le port {PORT} est deja utilise.")
            print("Fermez l'autre serveur ou changez le port.\n")
        else:
            print(f"\nERREUR: {e}\n")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\nArret du serveur...")
        print("Serveur arrete.\n")
        sys.exit(0)

if __name__ == "__main__":
    main()
