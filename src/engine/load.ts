import rawFlightNetwork from '../data/flight_network.json';
import { FlightNetworkData } from './types';

/**
 * Returns a cloned instance of the static flight network data.
 * Pure function with no Node-only APIs (runs in server and browser).
 */
export function loadFlightNetwork(): FlightNetworkData {
  return JSON.parse(JSON.stringify(rawFlightNetwork)) as FlightNetworkData;
}
