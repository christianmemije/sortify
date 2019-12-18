import { Injectable } from '@angular/core';
import { chunk, intersection, uniqBy } from 'lodash-es';
import { stringify } from 'querystring';
import SpotifyWebApi from 'spotify-web-api-js';
import { TokenService } from '../spotify-auth/service';
import { StateService } from '../state/state.service';

const spotifyApi = new SpotifyWebApi();

const MAX_LIMIT = 50;

export interface ITrackWFeatures extends SpotifyApi.PlaylistTrackObject, SpotifyApi.AudioFeaturesObject {}

function mergeTrackInfo(
  tracks: SpotifyApi.PlaylistTrackResponse,
  trackFeatures: SpotifyApi.MultipleAudioFeaturesResponse,
): ITrackWFeatures[] {
  if (tracks) {
    return tracks.items.map((track, index: number) => ({
      ...track,
      ...trackFeatures.audio_features[index],
    }));
  } else {
    return undefined;
  }
}

@Injectable({
  providedIn: 'root',
})
export class SpotifyWebApiService {
  constructor(private tokenSvc: TokenService, private _stateService: StateService) {
    spotifyApi.setAccessToken(this.tokenSvc.oAuthToken);
  }

  async getPlaylists(): Promise<SpotifyApi.ListOfUsersPlaylistsResponse> {
    const user: SpotifyApi.CurrentUsersProfileResponse = this._stateService.userProfile;
    const playlistsResponse: SpotifyApi.ListOfUsersPlaylistsResponse = await spotifyApi.getUserPlaylists(user.id, {
      limit: MAX_LIMIT,
    });
    const remaining: number = playlistsResponse.total - MAX_LIMIT;
    const numNecessaryCalls: number = Math.ceil(remaining / MAX_LIMIT);
    const necessaryCalls: Promise<SpotifyApi.ListOfUsersPlaylistsResponse>[] = Array.from(
      Array(numNecessaryCalls).keys(),
    ).map((index: number) => {
      return spotifyApi.getUserPlaylists(user.id, { offset: (index + 1) * MAX_LIMIT, limit: MAX_LIMIT });
    });
    const remainingPlaylistsResponses: SpotifyApi.ListOfUsersPlaylistsResponse[] = await Promise.all(necessaryCalls);
    return remainingPlaylistsResponses.reduce(
      (acc: SpotifyApi.ListOfUsersPlaylistsResponse, curr: SpotifyApi.ListOfUsersPlaylistsResponse) => {
        acc.items = [...(acc.items || []), ...curr.items];
        return acc;
      },
      playlistsResponse,
    );
  }

  async getPlaylist(playlistId: string): Promise<SpotifyApi.SinglePlaylistResponse> {
    return await spotifyApi.getPlaylist(playlistId);
  }

  async getPlaylistTracks(playlistId: string): Promise<SpotifyApi.PlaylistTrackResponse> {
    const tracksResponse: SpotifyApi.PlaylistTrackResponse = await spotifyApi.getPlaylistTracks(playlistId, {
      limit: MAX_LIMIT,
    });
    const remaining: number = tracksResponse.total - MAX_LIMIT;
    const numNecessaryCalls: number = Math.ceil(remaining / MAX_LIMIT);
    const necessaryCalls: Promise<SpotifyApi.PlaylistTrackResponse>[] = Array.from(Array(numNecessaryCalls).keys()).map(
      (index: number) => {
        return spotifyApi.getPlaylistTracks(playlistId, { offset: (index + 1) * MAX_LIMIT, limit: MAX_LIMIT });
      },
    );
    const remainingTracksResponses: SpotifyApi.PlaylistTrackResponse[] = await Promise.all(necessaryCalls);
    return remainingTracksResponses.reduce(
      (acc: SpotifyApi.PlaylistTrackResponse, curr: SpotifyApi.PlaylistTrackResponse) => {
        acc.items = [...(acc.items || []), ...curr.items];
        return acc;
      },
      tracksResponse,
    );
  }

  async updatePlaylist(playlistId: string, trackIds: string[]): Promise<SpotifyApi.ReplacePlaylistTracksResponse> {
    return await spotifyApi.replaceTracksInPlaylist(playlistId, trackIds);
  }

  async getFeaturesOfTracks(trackIds: string[]): Promise<SpotifyApi.MultipleAudioFeaturesResponse> {
    const GET_AUDIO_FEATURES_MAX = 100;
    const artistResponsesChunkedUp: Promise<SpotifyApi.MultipleAudioFeaturesResponse>[] = chunk(
      trackIds,
      GET_AUDIO_FEATURES_MAX,
    ).map((artistChunk: string[]) => spotifyApi.getAudioFeaturesForTracks(artistChunk));

    const allPromises: SpotifyApi.MultipleAudioFeaturesResponse[] = await Promise.all(artistResponsesChunkedUp);

    return allPromises.reduce(
      (acc: SpotifyApi.MultipleAudioFeaturesResponse, curr: SpotifyApi.MultipleAudioFeaturesResponse) => {
        acc.audio_features = [...(acc.audio_features || []), ...curr.audio_features];
        return acc;
      },
      { audio_features: [] },
    );
  }

  async getPlaylistTracksWithFeatures(playlistId: string): Promise<ITrackWFeatures[]> {
    const tracks: SpotifyApi.PlaylistTrackResponse = await this.getPlaylistTracks(playlistId);
    const trackFeatures: SpotifyApi.MultipleAudioFeaturesResponse = await this.getFeaturesOfTracks(
      tracks.items.map(({ track }) => track.id),
    );

    return mergeTrackInfo(tracks, trackFeatures);
  }
}
