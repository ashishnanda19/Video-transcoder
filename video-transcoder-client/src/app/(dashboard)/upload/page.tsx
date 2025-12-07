"use client";

import { Button } from "@/components/ui/button";
import { SERVER } from "@/constants";
import axios from "axios";
import { CameraIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

const MAX_FILE_SIZE = 30 * 1024 * 1024; // 20 MB

const Page = () => {
  const router = useRouter();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer?.files[0];

    if (!droppedFile) {
      return;
    }

    if (droppedFile.size > MAX_FILE_SIZE) {
      alert("File size exceeds 30 MB. Please upload a smaller video.");
      return;
    }

    const allowedTypes = ["video/mp4", "video/webm", "video/ogg"];
    if (!allowedTypes.includes(droppedFile.type)) {
      alert("Unsupported video format. Please upload MP4, WEBM, or OGG.");
      return;
    }

    setSelectedFile(droppedFile);
  };

  const handleFileInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selected = event.target.files && event.target.files[0];
    if (!selected) return;

    if (selected.size > MAX_FILE_SIZE) {
      alert("File size exceeds 20 MB. Please upload a smaller video.");
      return;
    }

    setSelectedFile(selected);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedFile) {
      alert("Please select a video file to upload.");
      return;
    }

    setLoading(true);

    try {
      const { name, type } = selectedFile;

      // Fetch pre-signed URL
      const { data } = await axios.get(
        `${SERVER}/video/get-upload-url?fileName=${name}&contentType=${type}`
      );

      const url = data.data;

      // Upload file to pre-signed URL
      const upload = await fetch(url, {
        method: "PUT",
        body: selectedFile,
        headers: {
          "Content-Type": type,
        },
      });

      if (upload.ok) {
        console.log("Uploaded successfully!");
        setSelectedFile(null); // Clear selectedFile state
        router.push(`/assets?fileName=${selectedFile.name.split(".")[0]}`);
      } else {
        throw new Error(
          `Upload to pre-signed URL failed with status: ${upload.status}`
        );
      }
    } catch (error) {
      console.error("Error occurred during upload:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <h1 className="text-4xl font-bold my-10 text-center">Upload Video</h1>
      <form onSubmit={handleSubmit} method="POST">
        <div className="px-4">
          <div
            className="border-2 border-dashed border-gray-200 rounded-lg p-12 flex items-center justify-center"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {selectedFile ? (
              <div className="text-center">
                <p>Selected video: {selectedFile.name}</p>
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <CameraIcon className="w-12 h-12 mx-auto text-gray-300" />
                <div className="prose max-w-none">
                  <h2 className="text-lg font-medium">
                    Drag and drop your video files
                  </h2>
                  <p className="text-sm text-gray-500">or click to upload</p>
                </div>
                <input
                  type="file"
                  id="file_input"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                <Button
                  size="sm"
                  type="button"
                  onClick={() => document.getElementById("file_input")?.click()}
                >
                  Select files
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="mt-10 text-center">
          <Button
            type="submit"
            className="bg-blue-500 text-white text-lg px-6 py-2  rounded hover:bg-blue-600"
          >
            {loading ? "Uploading..." : "Submit"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default Page;

