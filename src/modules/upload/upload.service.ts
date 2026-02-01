import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

@Injectable()
export class UploadService {
  private s3Client: S3Client;
  private bucket: string;
  private endpoint: string;
  private endpointDev: string;

  constructor(private configService: ConfigService) {
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    const endpointDev = this.configService.get<string>('S3_ENDPOINT_DEV');
    const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('S3_SECRET_ACCESS_KEY');
    const region = this.configService.get<string>('S3_REGION');
    const bucket = this.configService.get<string>('S3_BUCKET');

    if (!endpoint || !accessKeyId || !secretAccessKey || !region || !bucket || !endpointDev) {
      throw new Error('Missing S3 configuration for R2 integration');
    }

    this.bucket = bucket;
    this.endpoint = endpoint;
    this.endpointDev = endpointDev;
    
    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadFile(file: Express.Multer.File, folder: string = 'uploads'): Promise<string> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const fileExtension = file.originalname.split('.').pop();
    const fileName = `${folder}/${randomUUID()}.${fileExtension}`;

    try {
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucket,
          Key: fileName,
          Body: file.buffer,
          ContentType: file.mimetype,
        },
      });

      await upload.done();

      const publicUrl = `${this.endpointDev}/${fileName}`;
      return publicUrl;
    } catch (error) {
      throw new BadRequestException(`Failed to upload file: ${error}`);
    }
  }

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      const fileName = fileUrl.split(`${this.bucket}/`)[1];
      
      if (!fileName) {
        throw new BadRequestException('Invalid file URL');
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: fileName,
      });

      await this.s3Client.send(command);
    } catch (error) {
      throw new BadRequestException(`Failed to delete file: ${error }`);
    }
  }

  getPublicUrl(fileName: string): string {
    return `${this.endpoint}/${this.bucket}/${fileName}`;
  }
}
