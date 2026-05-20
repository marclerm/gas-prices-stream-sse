FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY GasApi.csproj ./
RUN dotnet restore GasApi.csproj

COPY . .
RUN dotnet publish GasApi.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./

ENV ASPNETCORE_URLS=http://+:5000
EXPOSE 5000

ENTRYPOINT ["dotnet", "GasApi.dll"]
