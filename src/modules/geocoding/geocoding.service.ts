// services/geocoding.service.ts
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

interface GeocodeResult {
  lat: number;
  lng: number;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly nominatimUrl = 'https://nominatim.openstreetmap.org/search';

  /**
   * Busca coordenadas (lat/lng) a partir de um endereço
   * Usa Nominatim (OpenStreetMap) - gratuito e sem chave de API
   */
  async getCoordinatesFromAddress(
    street: string,
    number: string,
    city: string,
    state?: string,
    zipCode?: string,
  ): Promise<GeocodeResult | null> {
    try {
      // Monta o endereço completo
      const addressParts = [
        `${street}, ${number}`,
        city,
        state,
        zipCode?.replace(/\D/g, ''),
        'Brazil', // País fixo
      ].filter(Boolean);

      const fullAddress = addressParts.join(', ');

      this.logger.log(`Geocoding address: ${fullAddress}`);

      // Faz requisição para Nominatim
      const response = await axios.get(this.nominatimUrl, {
        params: {
          q: fullAddress,
          format: 'json',
          limit: 1,
          countrycodes: 'br', // Apenas Brasil
          addressdetails: 1,
        },
        headers: {
          'User-Agent': 'YourAppName/1.0', // Obrigatório para Nominatim
        },
        timeout: 5000, // 5 segundos de timeout
      });

      if (response.data && response.data.length > 0) {
        const result = response.data[0];

        const coordinates = {
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
        };

        this.logger.log(
          `Coordinates found: lat=${coordinates.lat}, lng=${coordinates.lng}`,
        );

        return coordinates;
      }

      this.logger.warn(`No coordinates found for address: ${fullAddress}`);
      return null;
    } catch (error) {
      // Não lança erro, apenas retorna null
      // O endereço será salvo sem coordenadas
      return null;
    }
  }

  /**
   * Busca coordenadas apenas pelo CEP (mais rápido)
   */
  async getCoordinatesFromZipCode(
    zipCode: string,
  ): Promise<GeocodeResult | null> {
    try {
      const cleanZipCode = zipCode.replace(/\D/g, '');

      // Formata CEP para busca
      const formattedZipCode = `${cleanZipCode.slice(0, 5)}-${cleanZipCode.slice(5)}`;

      this.logger.log(`Geocoding zipCode: ${formattedZipCode}`);

      const response = await axios.get(this.nominatimUrl, {
        params: {
          postalcode: formattedZipCode,
          country: 'Brazil',
          format: 'json',
          limit: 1,
        },
        headers: {
          'User-Agent': 'YourAppName/1.0',
        },
        timeout: 5000,
      });

      if (response.data && response.data.length > 0) {
        const result = response.data[0];

        const coordinates = {
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
        };

        this.logger.log(
          `Coordinates found for zipCode: lat=${coordinates.lat}, lng=${coordinates.lng}`,
        );

        return coordinates;
      }

      this.logger.warn(`No coordinates found for zipCode: ${formattedZipCode}`);
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Método inteligente: tenta endereço completo, se falhar tenta apenas CEP
   */
  async getCoordinates(
    street: string,
    number: string,
    city: string,
    zipCode: string,
    state?: string,
  ): Promise<GeocodeResult | null> {
    // Primeiro tenta com endereço completo (mais preciso)
    let coordinates = await this.getCoordinatesFromAddress(
      street,
      number,
      city,
      state,
      zipCode,
    );

    // Se não encontrar, tenta apenas com CEP
    if (!coordinates) {
      this.logger.log('Trying geocoding by zipCode only...');
      coordinates = await this.getCoordinatesFromZipCode(zipCode);
    }

    return coordinates;
  }

  /**
   * Calcula distância entre dois pontos (Haversine formula)
   * Retorna distância em quilômetros
   */
  calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371; // Raio da Terra em km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 100) / 100; // Arredonda para 2 casas decimais
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

// ========================================
// ALTERNATIVA: Google Geocoding API
// ========================================
// Se você tiver budget, pode usar Google (mais preciso)
// Requer: npm install @googlemaps/google-maps-services-js

/*
import { Client } from '@googlemaps/google-maps-services-js';

@Injectable()
export class GoogleGeocodingService {
  private client: Client;

  constructor() {
    this.client = new Client({});
  }

  async getCoordinates(address: string): Promise<GeocodeResult | null> {
    try {
      const response = await this.client.geocode({
        params: {
          address,
          key: process.env.GOOGLE_MAPS_API_KEY,
        },
      });

      if (response.data.results.length > 0) {
        const location = response.data.results[0].geometry.location;
        return {
          lat: location.lat,
          lng: location.lng,
        };
      }

      return null;
    } catch (error) {
      console.error('Google Geocoding error:', error);
      return null;
    }
  }
}
*/
